import { createWorkersAI } from 'workers-ai-provider';
import { routeAgentRequest } from 'agents';
import { AIChatAgent } from '@cloudflare/ai-chat';
import {
	streamText,
	convertToModelMessages,
	pruneMessages,
	tool,
	stepCountIs,
	type StreamTextOnFinishCallback,
	type ToolSet,
} from 'ai';
import { z } from 'zod';

async function getSongs(
	desc: string,
	length: number,
	offset: number,
): Promise<SongInfo[]> {
	const songsResult = await fetch(
		`https://api.deezer.com/search/track?q=${ encodeURIComponent(desc) }&index=${ offset }&limit=${ length * 5 }`,
	);

	const songs = await songsResult.json();

	return await Promise.all(
		songs.data.map(async ({ id }) => {
			const songRes = await fetch(
				`https://api.deezer.com/track/${ id }`,
			);

			const song = await songRes.json();

			return {
				name: song.title,
				url: song.link,
				artists: song.contributors.map((c: any) => c.name),
				explicit: song.explicit_lyrics,
			};
		},
	));
}

export class ChatAgent extends AIChatAgent<Env> {
	async onChatMessage(
		onFinish: StreamTextOnFinishCallback<ToolSet>,
		options?: { abortSignal?: AbortSignal },
	) {
		const workersai = createWorkersAI({ binding: this.env.AI });

		const result = streamText({
			model: workersai('@cf/zai-org/glm-4.7-flash'),
				system: `You are a helpful assistant that generates playlists.

					Core Rules:
					-	Tool Usage:
						> You MUST ALWAYS use the generatePlaylist tool when the user requests a playlist.
						> You MUST NEVER generate or suggest playlists yourself.
						> You MUST call generatePlaylist exactly once per request.
						
					- Retry Logic (Explicit Content Rejection):
						If the tool call is rejected due to explicit content:
							> You may retry calling generatePlaylist ONLY ONCE
							> On retry, you MUST set allowExplicit = false
							> All other parameters must remain the same
							> NO FURTHER RETRIES are allowed under any circumstances.
						
					- Playlist Length Inference:
						If the user specified they would like N songs (e.g., "8 songs"):
						> Set length = N
					
						If the user specifies a duration (e.g., “50 minutes”):
						> Infer an appropriate average song length based on the genre
						> Calculate the number of songs accordingly
						> Set length to this value
						
						Otherwise use a default of 5.
						
					- Offset Handling:
						> You MUST infer the correct offset based on how many songs have already been generated
						  in prior tool calls within the session FOR THE SPECIFIC PLAYLIST IN QUESTION.
						> This ensures continuation rather than duplication.

					- Explicit Content Preference:
						You MUST infer whether explicit songs are allowed based on:
							> The current user request
							> Any previously stated persistent preferences
							> Explicit preferences in the current request ALWAYS override prior preferences.
							
						You MUST NEVER ask the user directly whether they want explicit songs or not. 
						You MUST rely on the tool call for asking the user and filtering explicit songs.
						
						- No Reasoning Output:
						> You MUST NEVER output internal reasoning, explanations, or calculations.
						> You MUST NEVER mention the variable allowExplicit out loud
						> You MUST NEVER think out loud. This is considered an error.
						> Your response should consist ONLY of the tool call.
						
					- Listing the output:
						> You MUST NOT list any song names, artists or urls yourself. This is considered an error.
						> Rely ONLY on the tool call to generate the correct output.
						> OUTPUT FORMAT: (This is what you should follow):
						  - OPTIONAL: Some conversational phrase to indicate playlist generation (e.g. "Let me generate your [genre] playlist")
						  - Tool call response: you WILL NOT put any text yourself here
						  - OPTIONAL: Some conversational phrase to indicate playlist generated (e.g. "Enjoy your [genre] playlist!")
						  
					You MUST limit text responses to 100 characters.
					You MUST only use alphanumeric characters and basic punctuation.
					`,
			// Prune old tool calls to save tokens on long conversations
			messages: pruneMessages({
				messages: await convertToModelMessages(this.messages),
				toolCalls: 'before-last-2-messages',
			}),
			tools: {
				generatePlaylist: tool({
					description: `Generates a playlist of songs.

						This tool handles explicit song filtering and approval automatically.
						
						Rules:
						- If allowExplicit is null, the system will prompt the user for approval.
						- The assistant MUST NOT ask the user about explicit songs.
						- If approval is denied, the assistant must retry with allowExplicit = false.
						
						The assistant should focus only on correctly setting allowExplicit based on user intent.`,
					inputSchema: z.object({
						genre: z.string().describe('What genre of songs should be included in the playlist.'),
						length: z.number().min(1).max(100).default(5).describe(`
							The number of songs in the playlist.
							
            	If this is ambiguous, then use a default of 5.
            	
            	If the user asks for a duration of d minutes, then try and find an average song length based off the genre,
            	so for example, general pop songs will be roughly 3-4 minutes long. Then set length = d / average song length (in minutes).
            	
            	There should be at least one song, and there should not be a need to generate more than 100 songs.`),
						offset: z.number().min(0).describe(
							`The offset to search at. For example, if you have generated a 10-song jazz playlist and the 
              user then requests you to add 5 more songs then you will set offset to 10 because there were already 10 songs.`,
						),
						allowExplicit: z.nullable(z.boolean()).describe(
							`Whether explicit songs are allowed:
													 - true => user allows explicit songs
													 - false => user does NOT want explicit songs
													 - null => unknown (will trigger approval UI)`
						),
					}),
					needsApproval: ({ allowExplicit }) => allowExplicit === null,
					execute: async ({ genre, length, offset, allowExplicit }) => {
						let iterations = 0;  // Use this as a guard to stop an infinite loop
						let songs: SongInfo[] = [];

						while (songs.length < length && iterations < 100) {
							let newSongs = (await getSongs(genre, length, offset + songs.length))
								.filter((song) => !song.explicit || allowExplicit || allowExplicit === null);

							for (let i = 0; i < newSongs.length; i++) {
								songs.push(newSongs[i]);
							}

							iterations++;
						}

						return songs.slice(0, length);
					},
				}),
			},
			onFinish,
			stopWhen: stepCountIs(10),
			abortSignal: options?.abortSignal,
		});

		return result.toUIMessageStreamResponse();
	}
}

export default {
	async fetch(request: Request, env: Env) {

		return (
			(await routeAgentRequest(request, env)) ||
			new Response('Not found', { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;

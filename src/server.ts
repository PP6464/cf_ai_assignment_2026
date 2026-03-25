import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from 'ai';
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are a helpful assistant.
       You generate playlists for the user based on the genre and length.
       You will ALWAYS use the generatePlaylist tool to generate playlists.
       You may have to ask the user for approval in case explicit songs are recommended.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        generatePlaylist: tool({
          description: "This tool requires a genre and some number of songs and returns a playlist of songs that fit this genre and with a length that is as given",
          inputSchema: z.object({
            desc: z.string().describe("A description of what songs to include in the playlist. This should be as specific as possible for better results."),
            length: z.number().min(1).describe("The number of songs in the playlist"),
            offset: z.number().min(0).describe(
              `The offset to search at. For example, if you have generated a 10-song jazz playlist and the 
              user then requests you to add 5 more songs then you will set offset to 10 because there were already 10 songs.`
            )
          }),
          execute: async ({ desc, length, offset }) => {
            const songsResult = await fetch(
              `https://api.deezer.com/search/track?q=${desc}&index=${offset}&limit=${length}`,
            );

            const songs = await songsResult.json();

            return await Promise.all(
              songs.data.map(async ({ id }) => {
                const songRes = await fetch(
                  `https://api.deezer.com/track/${id}`,
                );

                const song = await songRes.json();

                return {
                  name: song.title,
                  url: song.link,
                  artists: song.contributors.map((c) => c.name),
                  explicit: song.explicit_lyrics,
                };
              })
            );
          },
        }),
      },
      onFinish,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowsClockwiseIcon, MusicNoteIcon, StopIcon, TrashIcon } from '@phosphor-icons/react';
import { Loader } from '@cloudflare/kumo';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import type { ChatAddToolApproveResponseFunction, TextUIPart, UIMessage } from 'ai';

// This filters out AI responses' text parts that are clearly erroneous.
function validTextMessage(message: string) {
	if (message.length > 100) return false; // Should not be too long
	if (/[\[\]{}\n]/.test(message)) return false; // All signs of listing/structured output

	const lower = message.toLowerCase();

	// Words that should not need to appear and that are strong signs of listing songs.
	const listingKeywords = ['song', 'artist', 'track'];

	// Words that indicate the AI is explaining its reasoning
	const reasoningWords = ['user', 'ask', 'retry', 'think', '='];

	if (listingKeywords.some(keyword => lower.includes(keyword))) return false;
	return !reasoningWords.some(keyword => lower.includes(keyword));
}

function isSongInfoArray(value: any): value is SongInfo[] {
	return Array.isArray(value) && value.every(item =>
		typeof item === 'object' &&
		item !== null &&
		typeof item.name === 'string' &&
		typeof item.url === 'string' &&
		typeof item.explicit === 'boolean' &&
		Array.isArray(item.artists) &&
		item.artists.every((a: any) => typeof a === 'string'),
	);
}

function Message(
	message: UIMessage,
	addToolApprovalResponse: ChatAddToolApproveResponseFunction,
) {
	if (message.role === 'system') return (<></>);

	return (
		<div className={ `message-${ message.role }` } key={ message.id }>
			{
				message
					.parts
					.filter(e => e.type === 'tool-generatePlaylist' || (e.type === 'text' && (message.role === 'user' || validTextMessage(e.text))))
					.map((part, index) => {
						if (part.type === 'text' && part.state === 'streaming') return <p
							className={ 'message-part' } key={ index }>...</p>;
						if (part.type === 'text') return <p className={ 'message-part' } key={ index }>{ part.text }</p>;
						if (part.type === 'tool-generatePlaylist' && part.state === 'input-streaming') return <p
							className={ 'message-part' } key={ index }>...</p>;
						if (part.type === 'tool-generatePlaylist' && isSongInfoArray(part.output)) {
							return <div className={ 'message-part' } key={ index }>{
								(part.output as SongInfo[]).map(({ url, artists, name, explicit }, i) => (
									<a href={ url } key={ index + ':' + i }>
										<div className={ 'song-card' }>
											<h1>{ name }</h1>
											<h4>{ artists.join(', ') }</h4>
											{ explicit ? <p>(Explicit)</p> : <></> }
											<p>Click to view online</p>
										</div>
									</a>
								))
							}</div>;
						}
						if (part.type === 'tool-generatePlaylist' && part.state === 'approval-requested') {
							return (
								<div className={ 'request-approval' } key={ index }>
									<p>You need to provide approval to recommend explicit songs. Would you like to approve?</p>
									<div style={ { display: 'flex', justifyContent: 'space-between' } }>
										<button
											className={ 'approve-button' }
											onClick={ () => {
												addToolApprovalResponse({
													id: part.approval.id,
													approved: true,
												});
											} }
										>Approve
										</button>
										<button
											className={ 'reject-button' }
											onClick={ () => {
												addToolApprovalResponse({
													id: part.approval.id,
													approved: false,
												});
											} }
										>Reject
										</button>
									</div>
								</div>
							);
						}
						return <></>;
					})
			}
		</div>
	);
}

function Chat() {
	const [prompt, setPrompt] = useState<string>('');
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const [connected, setConnected] = useState(false);

	const agent = useAgent({
		agent: 'ChatAgent',
		onOpen: useCallback(() => setConnected(true), []),
		onClose: useCallback(() => setConnected(false), []),
		onError: useCallback(
			(error: Event) => console.error('WebSocket error:', error),
			[],
		),
	});

	const {
		messages,
		sendMessage,
		clearHistory,
		addToolApprovalResponse,
		stop,
		status,
	} = useAgentChat({
		agent,
		onToolCall: async (event) => {
			if (
				'addToolOutput' in event &&
				event.toolCall.toolName === 'getUserTimezone'
			) {
				event.addToolOutput({
					toolCallId: event.toolCall.toolCallId,
					output: {
						timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
						localTime: new Date().toLocaleTimeString(),
					},
				});
			}
		},
	});

	const isStreaming = status === 'streaming' || status === 'submitted';

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	return (
		<div
			className={ 'flex flex-col items-center justify-between h-lvh' }>
			<div id={ 'chat-outer' }>
				{
					messages.map((msg) => Message(msg, addToolApprovalResponse))
				}
				<div ref={ messagesEndRef }></div>
			</div>
			<form
				id={ 'prompt-form' }
				ref={ formRef }
				onSubmit={ (e) => {
					e.preventDefault();
					sendMessage({
						text: prompt,
					});
					setPrompt('');
				} }>
				<div
					className="flex align-center items-center justify-center"
					style={ { marginBottom: '20px' } }>
					<div id={ 'clear-button' }>
						<TrashIcon
							style={ { height: '30px', width: '30px' } }
							onClick={ clearHistory }/>
					</div>
					<input
						id={ 'prompt-input' }
						value={ prompt }
						onChange={ (e) => setPrompt(e.target.value) }
						className={ 'h-(--input-height) bg-gray-800 shadow rounded-3xl padding' }
						placeholder={ 'What kind of playlist would you like?' }
						disabled={ isStreaming || !connected }
					/>
					{ prompt !== '' && connected && !isStreaming ? <div id={ 'send-button' }>
						<MusicNoteIcon
							style={ { height: '30px', width: '30px' } }
							onClick={ () => {
								formRef.current?.requestSubmit();
							} }
						/>
					</div> : <></> }
					{ !isStreaming && messages.some(m => m.role === 'user') ? <div id={ 'retry-button' }>
						<ArrowsClockwiseIcon
							style={ { height: '30px', width: '30px' } }
							onClick={ () => {
								let userMessages = messages.filter(m => m.role === 'user');
								let lastPrompt = userMessages[userMessages.length - 1];
								sendMessage({
									text: (lastPrompt.parts[0] as TextUIPart).text,
								})
							} }
						/>
						</div> : <></> }
					{ isStreaming ? <div id={ 'stop-button' }>
						<StopIcon
							style={ { height: '30px', width: '30px' } }
							onClick={ () => {
								stop();
							} }/>
					</div> : <></> }
				</div>
			</form>
		</div>
	);
}

export default function App() {
	return (
		<Suspense fallback={ <Loader/> }>
			<Chat/>
		</Suspense>
	);
}

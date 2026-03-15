import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { MusicNoteIcon } from '@phosphor-icons/react';
import { Loader } from '@cloudflare/kumo';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import type { ToolUIPart, UIMessage } from 'ai';
import { mockMessages } from '../mock-data';

function Message(message: UIMessage) {
	if (message.role === "system") return (<></>);

	const isStreaming = message.parts.some((p) => {
		if ("state" in p) {
			return p.state?.includes("streaming");
		}
		return false;
	});

	const songs = message
		.parts
		.filter((e) => e.type === "tool-generatePlaylist")
		.flatMap((e) => (e as ToolUIPart).output as SongInfo);

	return (
		<div className={`message-${message.role}`}>
			{ isStreaming ? <p>...</p> : <>
				<p>{
					message
						.parts
						.filter((e) => e.type === 'text')
						.map((e) => e.text).join('')
				}</p>
				{
					songs
						.map(({ link, artists, title }) =>
							<a href={link} key={link}>
								<div className={"song-card"}>
									<h1>{ title }</h1>
									<p>{artists.join(", ")}</p>
								</div>
							</a>
						)
				}
			</>
			}
		</div>
	)
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
					mockMessages.map((msg) => Message(msg))
				}
				<div ref={ messagesEndRef }></div>
			</div>
			<form
				id={ 'prompt-form' }
				ref={ formRef }
				onSubmit={ (e) => {
					e.preventDefault();
					setPrompt('');
				} }>
				<div
					className="flex align-center items-center justify-center"
					style={ { marginBottom: '20px' } }>
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

import { type SubmitEventHandler, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowsClockwiseIcon, MusicNoteIcon, StopIcon, TrashIcon, SignOutIcon } from '@phosphor-icons/react';
import { Loader } from '@cloudflare/kumo';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import type { ChatAddToolApproveResponseFunction, TextUIPart, UIMessage } from 'ai';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { auth } from './firebase';
import { BrowserRouter, Navigate, Routes, Route, useNavigate } from 'react-router-dom';

function useAuth() {
	const [user, setUser] = useState<User | null | undefined>(undefined);

	useEffect(() => {
		return auth.onAuthStateChanged((user) => {
			setUser(user);
		});
	}, []);

	return user;
}

async function signUp(email: string, password: string) {
	return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

async function login(email: string, password: string) {
	return (await signInWithEmailAndPassword(auth, email, password)).user;
}

// This filters out AI responses' text parts that are clearly erroneous.
function validTextMessage(message: string) {
	if (message.length > 100) return false;
	if (/[\[\]{}\n]/.test(message)) return false;  // Indicators of listing/JSON output

	const lower = message.toLowerCase();

	// Words that should not need to appear and that are strong signs of listing songs.
	const listingKeywords = ['song', 'artist', 'track'];

	// Words that indicate the AI is explaining its reasoning
	const reasoningWords = ['user', 'ask', 'retry', 'think', '=', 'generatePlaylist'];

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
					.filter(e => e.type === 'tool-generatePlaylist' || (e.type === 'text' && (message.role === 'user' || e.state === 'streaming' || validTextMessage(e.text))))
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

function Chat({ user }: { user: User }) {
	const [prompt, setPrompt] = useState<string>('');
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const [connected, setConnected] = useState(false);
	const navigate = useNavigate();

	const agent = useAgent({
		agent: 'ChatAgent',
		name: user.uid,
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
	} = useAgentChat({ agent });

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
					<div id={ 'logout-button' }>
						<SignOutIcon
							style={ { height: '30px', width: '30px' } }
							onClick={ async () => {
								await auth.signOut();

								navigate('/auth');
							} }/>
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
								});
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
					<div id={ 'clear-button' }>
						<TrashIcon
							style={ { height: '30px', width: '30px' } }
							onClick={ clearHistory }/>
					</div>
				</div>
			</form>
		</div>
	);
}

function ChatPage() {
	const user = useAuth();

	if (user === undefined) {
		return <Loader/>;
	}

	if (user === null) {
		return <Navigate to={ '/auth' } replace={ true }/>;
	}

	return <Chat user={ user }/>;
}

function AuthPage() {
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [mode, setMode] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (e) => {
		e.preventDefault();

		if (loading) return;  // Already trying to login/sign up

		if (!(/\w+@\w+\.\w+/.test(email))) {
			alert('Please enter a valid email');
			return;
		}

		if (password.length < 6) {
			alert('Please enter a password of at least 6 characters');
			return;
		}

		setLoading(true);

		let accidentalSubmission = false;

		try {
			if (mode === 'login') {
				await login(email, password);
			} else if (mode === 'sign-up') {
				await signUp(email, password);
			} else {
				accidentalSubmission = true;  // The user did not press one of the buttons so this must be accidental.
				alert('Please use one of the buttons to indicate how you would like to login.');
				return;
			}

			navigate('/chat');
		} catch (err) {
			if (mode === 'login') {
				alert('Incorrect email/password entered');
			}

			if (mode === 'sign-up') {
				alert('Email is already in use');
			}
		} finally {
			if (!accidentalSubmission) {
				// There was a genuine login attempt that either failed or succeeded, and not an accidental submission.
				setEmail('');
				setPassword('');
			}
			setMode('');
			setLoading(false);
		}
	}

	return (
		<form
			id={ 'auth-form' }
			onSubmit={ handleSubmit }
			onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>
			<input value={email} placeholder={ 'Email' } onChange={ (e) => setEmail(e.target.value) }/>
			<input value={password} placeholder={ 'Password' } type={ 'password' } onChange={ (e) => setPassword(e.target.value) }/>
			<div>
				<button
					type={ 'submit' }
					onClick={(_) => { setMode('login') }}>
					Login
				</button>
				<button
					type={ 'submit' }
					onClick={(_) => { setMode('sign-up') }}>
					Sign Up
				</button>
			</div>
			{
				loading ? <div style={{ marginTop: '5px' }}><Loader/></div> : <></>
			}
		</form>
	)
}

function SelectPage() {
	const user = useAuth();

	if (user === undefined) {
		return <Loader/>;
	}

	if (user === null) {
		return <Navigate to='/auth' replace={ true }/>;
	}

	return <Navigate to='/chat' replace={ true }/>;
}

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path={ '/' } element={ <SelectPage/> } />
				<Route path={ '/auth' } element={ <AuthPage/> }/>
				<Route path={ '/chat' } element={
					<Suspense fallback={ <Loader/> }>
						<ChatPage/>
					</Suspense>
				}/>
			</Routes>
		</BrowserRouter>
	);
}

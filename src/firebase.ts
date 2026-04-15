import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
	apiKey: 'AIzaSyAr7dbhQGNJcC--CQulri9Q3X4xPwqKKao',
	authDomain: 'cf-ai-assignment-2026.firebaseapp.com',
	projectId: 'cf-ai-assignment-2026',
	storageBucket: 'cf-ai-assignment-2026.firebasestorage.app',
	messagingSenderId: '583635479931',
	appId: '1:583635479931:web:6df3bd236c5c3a746ae1de',
	measurementId: 'G-7V7ZXRRDDS',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
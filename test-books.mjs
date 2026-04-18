import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD1P02TRlTsPgNXKhUJ26OnXbCGSVJOFa8",
  authDomain: "enarvapp.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function test() {
  const creds = await signInWithEmailAndPassword(auth, 'aryansakaria1@gmail.com', 'password');
  const token = await creds.user.getIdToken();
  const res = await fetch('https://api.enarv.com/books?limit=1', { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  console.log(JSON.stringify(data[0] || data, null, 2));
  process.exit(0);
}
test().catch(console.error);

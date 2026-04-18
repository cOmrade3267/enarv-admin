import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs/promises';

const firebaseConfig = {
  apiKey: "AIzaSyD1P02TRlTsPgNXKhUJ26OnXbCGSVJOFa8",
  authDomain: "enarvapp.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function testAll() {
  const creds = await signInWithEmailAndPassword(auth, 'aryansakaria1@gmail.com', 'password');
  const token = await creds.user.getIdToken();
  const headers = { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const sweepFile = await fs.readFile('api_sweep_status_now.tsv', 'utf-8');
  const lines = sweepFile.split('\n').filter(l => l.trim().length > 0);
  
  const results = [];
  
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const method = parts[0];
    const path = parts[1];
    
    try {
      const url = `https://api.enarv.com${path}`;
      const res = await fetch(url, { 
        method, 
        headers, 
        signal: AbortSignal.timeout(5000)
      });
      const text = await res.text();
      
      let msg = text;
      try {
        const json = JSON.parse(text);
        if (json.message || json.error) {
          msg = json.message || json.error;
          if (json.details) msg += ' ' + JSON.stringify(json.details);
        }
      } catch (e) {}
      
      msg = msg.substring(0, 300).replace(/\n/g, ' ').trim(); // Avoid huge dumps
      const row = `${method}\t${path}\t${res.status}\t${msg}`;
      results.push(row);
      console.log(row);
    } catch (e) {
      const row = `${method}\t${path}\tERROR\t${e.message}`;
      results.push(row);
      console.log(row);
    }
  }
  
  await fs.writeFile('api_errors_output.tsv', results.join('\n'));
  process.exit(0);
}

testAll().catch(console.error);

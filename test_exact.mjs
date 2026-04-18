import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD1P02TRlTsPgNXKhUJ26OnXbCGSVJOFa8",
  authDomain: "enarvapp.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function exportFullMessages() {
  const creds = await signInWithEmailAndPassword(auth, 'aryansakaria1@gmail.com', 'password');
  const token = await creds.user.getIdToken();
  const headers = { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  async function call(method, path, body = null) {
    const url = `https://api.enarv.com${path}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    const text = await res.text();
    console.log(`\n========== ${method} ${path} (${res.status}) ==========`);
    console.log(text);
    console.log(`========================================================================`);
  }

  const usersRes = await fetch("https://api.enarv.com/admin/users?limit=1", { headers });
  const usersJson = await usersRes.json();
  const userId = usersJson[0]?.user_id || 'test';

  const booksRes = await fetch("https://api.enarv.com/books?limit=1", { headers });
  const booksJson = await booksRes.json();
  const bookId = booksJson[0]?.id || 'test';

  const orderRes = await fetch("https://api.enarv.com/admin/orders?limit=1", { headers });
  const orderJson = await orderRes.json();
  const orderId = orderJson[0]?.id || 'test';

  // 500 errors
  await call('DELETE', `/admin/users/dummy-non-existent-user`);
  await call('PATCH', `/orders/${orderId}/status`, { status: "shipped" });
  await call('GET', `/admin/settings`);

  // Missing routes 404
  await call('PATCH', `/admin/users/${userId}/role`, { role: "admin" });
  await call('POST', `/admin/books`, { title: "Test Admin Book" });
  await call('PATCH', `/admin/books/${bookId}/stock`, { offset: 5 });

  // Conflict 409
  await call('DELETE', `/admin/books/${bookId}`);

  process.exit(0);
}

exportFullMessages().catch(console.error);

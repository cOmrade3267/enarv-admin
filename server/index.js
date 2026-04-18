const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = process.env.ADMIN_API_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'enarv-admin-jwt-secret';
const JWT_REFRESH = process.env.JWT_REFRESH_SECRET || 'enarv-admin-refresh-secret';

app.use(cors());
app.use(express.json());

// ─── Hardcoded demo admin (replace with DB in production) ───
const DEMO_ADMIN = {
  id: '1',
  email: 'admin@enarv.com',
  password_hash: bcrypt.hashSync('admin123', 10),
  role: 'super_admin',
};

// ─── Auth Middleware ───
function verifyAdminJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });
  try {
    req.admin = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ─── Auth Routes ───
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  if (email !== DEMO_ADMIN.email || !bcrypt.compareSync(password, DEMO_ADMIN.password_hash)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const accessToken = jwt.sign({ id: DEMO_ADMIN.id, email, role: DEMO_ADMIN.role }, JWT_SECRET, { expiresIn: '24h' });
  const refreshToken = jwt.sign({ id: DEMO_ADMIN.id }, JWT_REFRESH, { expiresIn: '7d' });
  res.json({ accessToken, refreshToken, email, role: DEMO_ADMIN.role });
});

// ─── Protected Routes (all return mock data for demo) ───
app.use('/api/admin', verifyAdminJWT);

// Dashboard
app.get('/api/admin/dashboard', (req, res) => {
  res.json({
    totalUsers: 12847, usersToday: 134, usersThisWeek: 892,
    postsToday: 456, commentsToday: 1203, activeUsersToday: 3421,
    totalClubs: 287, activeClubs: 198,
    ordersToday: 67, revenueToday: 48750, referralsToday: 42,
    latestUsers: [
      { id: '1', full_name: 'Aarav Sharma', username: 'aarav_reads', created_at: new Date().toISOString() },
      { id: '2', full_name: 'Priya Patel', username: 'priyap', created_at: new Date(Date.now() - 900000).toISOString() },
    ],
    latestPosts: [
      { id: 'p1', title: 'Just finished The Alchemist!', username: 'aarav_reads', likes_count: 24, created_at: new Date().toISOString() },
    ],
    latestOrders: [
      { id: 'ORD-4521', user: 'aarav_reads', amount: 1299, status: 'pending', created_at: new Date().toISOString() },
    ],
  });
});

// Users
app.get('/api/admin/users', (req, res) => res.json({ users: [], total: 0 }));
app.get('/api/admin/users/:id', (req, res) => res.json({ id: req.params.id, full_name: 'User', username: 'user', email: 'user@example.com', status: 'active', role: 'user', posts: [], comments: [], clubs: [], orders: [] }));
app.patch('/api/admin/users/:id/status', (req, res) => res.json({ message: 'Status updated' }));
app.patch('/api/admin/users/:id/permissions', (req, res) => res.json({ message: 'Permissions updated', role: req.body.role }));
app.delete('/api/admin/users/:id', (req, res) => res.json({ message: 'User deleted' }));

// Moderation
app.get('/api/admin/posts', (req, res) => res.json({ posts: [] }));
app.delete('/api/admin/posts/:id', (req, res) => res.json({ message: 'Post deleted' }));
app.patch('/api/admin/posts/:id/hide', (req, res) => res.json({ message: 'Post hidden' }));
app.get('/api/admin/comments', (req, res) => res.json({ comments: [] }));
app.delete('/api/admin/comments/:id', (req, res) => res.json({ message: 'Comment deleted' }));
app.get('/api/admin/stories', (req, res) => res.json({ stories: [] }));
app.delete('/api/admin/stories/:id', (req, res) => res.json({ message: 'Story deleted' }));
app.get('/api/admin/reports', (req, res) => res.json({ reports: [] }));
app.patch('/api/admin/reports/:id', (req, res) => res.json({ message: 'Report updated' }));

// Clubs
app.get('/api/admin/clubs', (req, res) => res.json({ clubs: [] }));
app.post('/api/admin/clubs', (req, res) => res.status(201).json({ message: 'Club created' }));
app.delete('/api/admin/clubs/:id', (req, res) => res.json({ message: 'Club deleted' }));
app.patch('/api/admin/clubs/:id/suspend', (req, res) => res.json({ message: 'Club suspended' }));
app.patch('/api/admin/clubs/:id/transfer-owner', (req, res) => res.json({ message: 'Ownership transferred' }));
app.get('/api/admin/clubs/:id/posts', (req, res) => res.json({ posts: [] }));
app.patch('/api/admin/clubs/:clubId/posts/:postId/pin', (req, res) => res.json({ message: 'Post pin toggled', pinned: req.body.pinned }));
app.patch('/api/admin/clubs/:clubId/posts/:postId/highlight', (req, res) => res.json({ message: 'Post highlight toggled', highlighted: req.body.highlighted }));

// Books
app.get('/api/admin/books', (req, res) => res.json({ books: [] }));
app.post('/api/admin/books', (req, res) => {
  // Duplicate ISBN check placeholder
  res.status(201).json({ message: 'Book created', id: 'b' + Date.now() });
});
app.patch('/api/admin/books/:id', (req, res) => res.json({ message: 'Book updated' }));
app.delete('/api/admin/books/:id', (req, res) => res.json({ message: 'Book deleted' }));
app.patch('/api/admin/books/:id/stock', (req, res) => res.json({ message: 'Stock updated' }));
app.post('/api/admin/books/bulk-upload', (req, res) => res.json({ message: 'Bulk upload processed', imported: 0 }));

// Orders
app.get('/api/admin/orders', (req, res) => res.json({ orders: [] }));
app.get('/api/admin/orders/:id', (req, res) => res.json({ id: req.params.id }));
app.patch('/api/admin/orders/:id/status', (req, res) => res.json({ message: 'Status updated' }));
app.patch('/api/admin/orders/:id/cancel', (req, res) => res.json({ message: 'Order cancelled' }));

// Notifications
app.post('/api/admin/notifications/send', (req, res) => res.json({ message: 'Notification sent', recipients: 0, status: 'sent' }));
app.get('/api/admin/notifications/history', (req, res) => res.json({ notifications: [] }));

// Referrals
app.get('/api/admin/referrals', (req, res) => res.json({ referrals: [] }));
app.get('/api/admin/referrals/top', (req, res) => res.json({ leaderboard: [] }));

// Analytics
app.get('/api/admin/analytics', (req, res) => {
  const days30 = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
    count: Math.floor(Math.random() * 500 + 200),
  }));
  res.json({ userGrowth: days30, dailyActiveUsers: days30, postsPerDay: days30, commentsPerDay: days30, ordersPerDay: days30, referralGrowth: days30 });
});

// Tickets / Support
app.get('/api/admin/tickets', (req, res) => res.json({ tickets: [] }));
app.get('/api/admin/tickets/:id', (req, res) => res.json({ id: req.params.id }));
app.post('/api/admin/tickets/:id/reply', (req, res) => res.json({ message: 'Reply sent' }));
app.patch('/api/admin/tickets/:id/status', (req, res) => res.json({ message: 'Status updated' }));

// Content — Blogs
app.get('/api/admin/blogs', (req, res) => res.json({ blogs: [] }));
app.post('/api/admin/blogs', (req, res) => res.status(201).json({ message: 'Blog created' }));
app.patch('/api/admin/blogs/:id', (req, res) => res.json({ message: 'Blog updated' }));
app.delete('/api/admin/blogs/:id', (req, res) => res.status(204).end());

// Content — Banners
app.get('/api/admin/banners', (req, res) => res.json({ banners: [] }));
app.post('/api/admin/banners', (req, res) => res.status(201).json({ message: 'Banner created' }));
app.patch('/api/admin/banners/:id', (req, res) => res.json({ message: 'Banner updated' }));
app.delete('/api/admin/banners/:id', (req, res) => res.status(204).end());

// Content — Limited Time Offers
app.get('/api/admin/limited-offers', (req, res) => res.json({ offers: [] }));
app.post('/api/admin/limited-offers', (req, res) => res.status(201).json({ message: 'Offer created', id: 'lto' + Date.now() }));
app.delete('/api/admin/limited-offers/:id', (req, res) => res.json({ message: 'Offer deleted' }));

// Content — Featured Authors
app.get('/api/admin/featured-authors', (req, res) => res.json({ authors: [] }));
app.post('/api/admin/featured-authors', (req, res) => res.status(201).json({ message: 'Author featured', id: 'fa' + Date.now() }));
app.delete('/api/admin/featured-authors/:id', (req, res) => res.json({ message: 'Author removed' }));

// Settings
app.get('/api/admin/settings', (req, res) => res.json({ minDiscountOrderValue: 500, maxDiscountPercent: 30, storyDurationHours: 24, chatRetentionDays: 90, referralRewardAmount: 50, referralMilestones: '3,7,15,30', maintenanceMode: false }));
app.patch('/api/admin/settings', (req, res) => res.json({ message: 'Settings updated', ...req.body }));

app.listen(PORT, () => {
  console.log(`🚀 ENARV Admin API running on port ${PORT}`);
  console.log(`   Login: admin@enarv.com / admin123`);
});

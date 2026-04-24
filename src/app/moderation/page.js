'use client';

import { useState, useEffect, useCallback } from 'react';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { adminApi } from '@/lib/api';

export default function ModerationPage() {
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState('posts');
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [stories, setStories] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null);

  function pickArray(payload, keys = []) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) {
      const val = payload?.[key]
        ?? payload?.data?.[key]
        ?? payload?.result?.[key]
        ?? payload?.payload?.[key];
      if (Array.isArray(val)) return val;
    }
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.rows)) return payload.rows;
    return [];
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, commentsRes, storiesRes, myStoriesRes, reportsRes] = await Promise.allSettled([
        adminApi.getPosts(),
        adminApi.getComments(),
        adminApi.getStories(),
        adminApi.getMyStories(),
        adminApi.getReports(),
      ]);

      const failed = [];
      if (postsRes.status === 'rejected') failed.push('posts');
      if (commentsRes.status === 'rejected') failed.push('comments');
      if (storiesRes.status === 'rejected' && myStoriesRes.status === 'rejected') failed.push('stories');
      if (reportsRes.status === 'rejected') failed.push('reports');

      if (failed.length > 0) {
        showToast(`Failed to fetch: ${failed.join(', ')}`, 'error');
      }

      const p = postsRes.status === 'fulfilled' ? postsRes.value : [];
      const c = commentsRes.status === 'fulfilled' ? commentsRes.value : [];
      const s = storiesRes.status === 'fulfilled' ? storiesRes.value : [];
      const sMine = myStoriesRes.status === 'fulfilled' ? myStoriesRes.value : [];
      const r = reportsRes.status === 'fulfilled' ? reportsRes.value : [];

      // API helpers now normalize most of these, but we keep extraction logic for safety
      const postListRaw = pickArray(p, ['posts', 'latestPosts']);
      const commentListRaw = pickArray(c, ['comments', 'reported_comments', 'moderation_comments']);
      const feedStories = pickArray(s, ['stories', 'active_stories', 'story_items']);
      const myStories = pickArray(sMine, ['stories', 'active_stories', 'story_items']);
      const storyListRaw = feedStories.length > 0 ? feedStories : myStories;
      const reportListRaw = pickArray(r, ['reports', 'content_reports', 'moderation_reports']);

      let postItems = postListRaw.map((item) => ({
        ...item,
        id: item.id || item.post_id,
        title: item.title || item.content || 'Untitled',
        author: item.author || item.username || item.user?.username || 'unknown',
        club: item.club || item.club_name || item.group_name || '—',
        likes_count: item.likes_count ?? item.likes ?? 0,
        comments_count: item.comments_count ?? item.comment_count ?? 0,
        created_at: item.created_at || item.createdAt || null,
      }));

      // Enrich posts with detail data if counts are missing
      postItems = await Promise.all(
        postItems.map(async (item) => {
          if ((item.likes_count !== 0 && !item.likes_count) || !item.id) return item;
          try {
            const details = await adminApi.getPost(item.id);
            return {
              ...item,
              likes_count: details?.likes_count ?? details?.likes ?? item.likes_count ?? 0,
              comments_count: details?.comments_count ?? details?.comment_count ?? item.comments_count ?? 0,
            };
          } catch {
            return item;
          }
        })
      );

      setPosts(postItems);
      setComments(commentListRaw.map((item) => ({
        ...item,
        id: item.id || item.comment_id,
        post_id: item.post_id || item.postId || item.post?.id,
        content: item.content || item.text || '—',
        author: item.author || item.username || item.user?.username || 'unknown',
        post_title: item.post_title || item.post?.title || item.post_id || '—',
        created_at: item.created_at || item.createdAt || null,
      })));
      setStories(storyListRaw.map(item => ({
        ...item,
        id: item.id || item.story_id,
        author: item.author || item.username || item.user?.username || 'unknown',
        media_type: item.media_type || item.type || 'story',
        created_at: item.created_at || item.createdAt || null,
      })));
      setReports(reportListRaw.map(item => ({
        ...item,
        id: item.id || item.report_id,
        reporter: item.reporter || item.reporter_username || item.user?.username || 'unknown',
        reported_content: item.reported_content || item.content || item.target || '—',
        reason: item.reason || item.reason_code || '—',
        status: item.status || 'new',
        created_at: item.created_at || item.createdAt || null,
      })));
    } catch (err) {
      showToast(err.message || 'Failed to load moderation data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAction() {
    if (!confirmAction) return;
    const { type, id, action } = confirmAction;
    try {
      if (type === 'post' && action === 'delete') {
        await adminApi.deletePost(id);
      } else if (type === 'comment' && action === 'delete') {
        await adminApi.deleteComment(id, confirmAction.postId);
      } else if (type === 'story') {
        await adminApi.deleteStory(id);
      } else if (type === 'report') {
        await adminApi.updateReport(id, { status: action });
      }
      showToast('Action completed');
      loadData();
    } catch (err) {
      const msg = err.message || 'Action failed';
      if (msg.includes('not found') || msg.includes('permission') || msg.includes('authorized') || msg.includes('Cannot DELETE') || msg.includes('403') || msg.includes('Forbidden')) {
        showToast(
          `${type}: delete blocked by API (needs admin DELETE or your token must own the content). ${msg}`,
          'error'
        );
      } else {
        showToast(msg, 'error');
      }
    }
    setConfirmAction(null);
  }

  const tabs = ['posts', 'comments', 'stories', 'reports'];

  return (
    <div id="moderation-page">
      <div className="tabs" style={{ marginTop: 0 }}>
        {tabs.map(tab => (
          <button 
            key={tab} 
            className={`tab ${activeTab === tab ? 'active' : ''}`} 
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="chip" style={{ marginLeft: '8px' }}>
              {tab === 'posts' ? posts.length : tab === 'comments' ? comments.length : tab === 'stories' ? stories.length : reports.length}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'posts' && (
        <DataTable 
          id="mod-posts"           columns={[
            { header: 'ID', accessor: 'id', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{r.id?.substring(0, 8)}</span> },
            { header: 'Content', accessor: 'title', render: (r) => <span style={{ color: r.is_hidden ? 'var(--text-muted)' : 'var(--text-primary)', maxWidth: '280px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content || r.title || '(no content)'} {r.is_hidden && '🙈'}</span> },
            { header: 'Author', accessor: 'author', render: (r) => `@${r.author || 'system'}` },
            { header: 'Club', accessor: 'club' },
            { header: 'Engagement', accessor: (r) => `${r.likes_count} likes, ${r.comments_count} comments`, render: (r) => <span>{r.likes_count}♥ {r.comments_count}💬</span> },
            { header: 'Date', accessor: 'created_at', render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : '—') },
          ]} 
          data={posts} 
          loading={loading} 
          actions={(row) => (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button 
                className="btn btn-danger btn-sm" 
                onClick={() => setConfirmAction({ type: 'post', id: row.id, action: 'delete' })}
              >
                Delete
              </button>
            </div>
          )} 
        />
      )}

      {activeTab === 'comments' && (
        <DataTable 
          id="mod-comments" 
          columns={[
            { header: 'ID', accessor: 'id', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{r.id?.substring(0, 8)}</span> },
            { header: 'Content', accessor: 'content', render: (r) => <span style={{ maxWidth: '280px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content || '—'}</span> },
            { header: 'Author', accessor: 'author', render: (r) => `@${r.author || 'unknown'}` },
            { header: 'On Post', accessor: 'post_title' },
            { header: 'Date', accessor: 'created_at', render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Not provided') },
          ]} 
          data={comments} 
          loading={loading} 
          actions={(row) => (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmAction({ type: 'comment', id: row.id, postId: row.post_id, action: 'delete' })}
              >
                Delete
              </button>
            </div>
          )}
        />
      )}

      {activeTab === 'stories' && (
        <DataTable 
          id="mod-stories" 
          columns={[
            { header: 'ID', accessor: 'id', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{r.id?.substring(0, 8)}</span> },
            { header: 'Author', accessor: 'author', render: (r) => `@${r.author || 'unknown'}` },
            { header: 'Type', accessor: 'media_type' },
            { header: 'Created', accessor: 'created_at', render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : 'Not provided') },
          ]} 
          data={stories} 
          loading={loading} 
          actions={(row) => (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmAction({ type: 'story', id: row.id, action: 'delete' })}>Delete</button>
          )} 
        />
      )}

      {activeTab === 'reports' && (
        <DataTable 
          id="mod-reports" 
          columns={[
            { header: 'ID', accessor: 'id', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{r.id?.substring(0, 8)}</span> },
            { header: 'Reporter', accessor: 'reporter', render: (r) => `@${r.reporter || 'unknown'}` },
            { header: 'Content', accessor: 'reported_content' },
            { header: 'Reason', accessor: 'reason', render: (r) => <span className="chip">{r.reason}</span> },
            { header: 'Status', accessor: 'status', render: (r) => <StatusBadge status={r.status} /> },
            { header: 'Date', accessor: 'created_at', render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Not provided') },
          ]} 
          data={reports} 
          loading={loading} 
          actions={(row) => (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {row.status === 'new' && (
                <button className="btn btn-warning btn-sm" onClick={() => setConfirmAction({ type: 'report', id: row.id, action: 'in-review' })}>Review</button>
              )}
              {row.status !== 'resolved' && (
                <button className="btn btn-success btn-sm" onClick={() => setConfirmAction({ type: 'report', id: row.id, action: 'resolved' })}>Resolve</button>
              )}
            </div>
          )} 
        />
      )}

      <Modal 
        isOpen={!!confirmAction} 
        onClose={() => setConfirmAction(null)} 
        title="Confirm Action" 
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleAction}>Confirm</button>
          </>
        )}
      >
        <div className="confirm-dialog-text">
          <div className="confirm-dialog-icon danger">⚠️</div>
          <h3>Are you sure?</h3>
          <p>
            This action cannot be undone. The {confirmAction?.type === 'comment' ? 'comment' : confirmAction?.type} will be {confirmAction?.action === 'delete' ? 'permanently deleted' : `marked as ${confirmAction?.action}`}.
          </p>
        </div>
      </Modal>
    </div>
  );
}

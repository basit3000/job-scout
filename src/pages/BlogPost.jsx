import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPost, formatDate } from './blogPosts';

function getReadingTime(content) {
  const words = content.join(' ').trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function BlogPost() {
  const { slug } = useParams();
  const post = getPost(slug);
  const [views, setViews] = useState(null);

  useEffect(() => {
    if (post) {
      document.title = `${post.title} · Basit Zaheer`;
    }
  }, [post]);

  useEffect(() => {
    if (!post) return;
    setViews(null);
    fetch(`/api/views?slug=${encodeURIComponent(slug)}`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setViews(data.views))
      .catch(() => setViews(null));
  }, [slug, post]);

  if (!post) {
    return (
      <div className="page-enter">
        <div className="page-header">
          <h1>Post not found</h1>
          <p className="page-subtitle">This post doesn't exist or may have been moved.</p>
        </div>
        <Link className="blog-back" to="/blogs">
          <i className="fas fa-arrow-left"></i>Back to blogs
        </Link>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <Link className="blog-back" to="/blogs">
        <i className="fas fa-arrow-left"></i>Back to blogs
      </Link>
      <article className="blog-post">
        <div className="blog-item-meta">
          <span className="blog-category">
            <i className={post.icon}></i>{post.category}
          </span>
          <span className="blog-date">{formatDate(post.date)}</span>
          <span className="blog-date"><i className="far fa-clock"></i> {getReadingTime(post.content)} min read</span>
          <span className="blog-date"><i className="fas fa-eye"></i> {Number(views || 0).toLocaleString()} {Number(views || 0) === 1 ? 'view' : 'views'}</span>
        </div>
        <h1 className="blog-post-title">{post.title}</h1>
        <div className="blog-post-body">
          {post.content.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {post.link && (
          <a
            className="project-card-link blog-post-link"
            href={post.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub <i className="fas fa-arrow-right"></i>
          </a>
        )}
      </article>
    </div>
  );
}

export default BlogPost;

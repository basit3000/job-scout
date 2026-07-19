import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { posts, formatDate } from './blogPosts';

function Blog() {
  const [views, setViews] = useState({});

  useEffect(() => {
    const slugs = posts.map((post) => post.slug).join(',');
    fetch(`/api/views?slugs=${encodeURIComponent(slugs)}`)
      .then((res) => res.json())
      .then((data) => setViews(data.views || {}))
      .catch(() => setViews({}));
  }, []);

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1>Blogs</h1>
        <p className="page-subtitle">Build logs and notes from the lane.</p>
      </div>
      <div className="blog-list">
        {posts.map((post) => (
          <Link className="blog-item" to={`/blogs/${post.slug}`} key={post.slug}>
            <div className="blog-item-meta">
              <span className="blog-category">
                <i className={post.icon}></i>{post.category}
              </span>
              <span className="blog-date">{formatDate(post.date)}</span>
              <span className="blog-date">
                <i className="fas fa-eye"></i> {Number(views[post.slug] || 0).toLocaleString()} {Number(views[post.slug] || 0) === 1 ? 'view' : 'views'}
              </span>
            </div>
            <h3 className="blog-item-title">{post.title}</h3>
            <p className="blog-item-excerpt">{post.excerpt}</p>
            <span className="blog-item-arrow" aria-hidden="true">
              <i className="fas fa-arrow-right"></i>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Blog;

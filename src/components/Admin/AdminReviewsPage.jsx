/**
 * AdminReviewsPage — admin oversight of all reviews on the platform.
 *
 * Per spec: "Sellers,Admin is currently unable to view the comments
 * submitted by buyers." — this page fixes the admin side of that.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminAllReviews } from '../../api/reviewNotificationApi';
import ReviewList from '../Reviews/ReviewList';
import StarRating from '../Reviews/StarRating';
import NotificationBell from '../Common/NotificationBell';

export default function AdminReviewsPage({ admin }) {
  const adminId = admin?.admin_id || admin?._id;
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');
  const [avgRating, setAvgRating] = useState(0);

  const load = async () => {
    setLoading(true);
    const res = await getAdminAllReviews({
      q: search || undefined,
      min_rating: minRating || undefined,
      max_rating: maxRating || undefined,
    });
    if (res?.success) {
      setReviews(res.reviews || []);
      setAvgRating(res.average_rating || 0);
    }
    setLoading(false);
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, minRating, maxRating]);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">All Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Oversight of all customer reviews across the platform
          </p>
        </div>
        <NotificationBell
          userId="admin"
          role="admin"
          onNavigate={(path) => navigate(path)}
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Total Reviews</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{reviews.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Average Rating</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-gray-800">{avgRating.toFixed(1)}</span>
            <StarRating value={avgRating} size="sm" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">AI-Generated</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {reviews.filter((r) => r.ai_generated).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Hidden</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {reviews.filter((r) => r.visible === false).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by comment, title, buyer, product…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#a37b3d] outline-none"
        />
        <select
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
        >
          <option value="">Min ★</option>
          {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => (
            <option key={r} value={r}>{r}★</option>
          ))}
        </select>
        <select
          value={maxRating}
          onChange={(e) => setMaxRating(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
        >
          <option value="">Max ★</option>
          {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => (
            <option key={r} value={r}>{r}★</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 mx-auto border-2 border-gray-200 border-t-[#a37b3d] rounded-full animate-spin" />
        </div>
      ) : (
        <ReviewList
          reviews={reviews}
          showProduct
          showAiBadge
          emptyMessage="No reviews match your filters"
        />
      )}
    </div>
  );
}

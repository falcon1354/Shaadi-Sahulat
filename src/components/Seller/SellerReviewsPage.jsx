/**
 * SellerReviewsPage — shows all reviews left by buyers on this seller's
 * products. Also shows aggregate rating + distribution histogram.
 *
 * Per spec: "Sellers can view all reviews associated with their products."
 *
 * This is the fix for the "seller cannot view buyer comments" issue.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSellerAllReviews, getSellerRating } from '../../api/reviewNotificationApi';
import ReviewList from '../Reviews/ReviewList';
import StarRating from '../Reviews/StarRating';
import NotificationBell from '../Common/NotificationBell';

export default function SellerReviewsPage({ seller }) {
  const sellerId = seller?.seller_id;
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | 5 | 4 | 3 | 2 | 1

  const load = async () => {
    if (!sellerId) return;
    setLoading(true);
    const [listRes, sumRes] = await Promise.all([
      getSellerAllReviews(sellerId),
      getSellerRating(sellerId),
    ]);
    if (listRes?.success) setReviews(listRes.reviews || []);
    if (sumRes?.success)  setSummary(sumRes);
    setLoading(false);
  };

  useEffect(() => { load(); }, [sellerId]);

  const filtered = reviews.filter((r) => {
    if (filter === 'all') return true;
    const bucket = Math.floor(r.rating);
    return bucket === Number(filter);
  });

  const dist = summary?.distribution || {};
  const total = summary?.count || 0;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header with notification bell */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Customer Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            All reviews left by buyers on your products
          </p>
        </div>
        <NotificationBell
          userId={sellerId}
          role="seller"
          onNavigate={(path) => navigate(path)}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase">Average Rating</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl font-bold text-gray-800">
              {summary?.average_rating?.toFixed(1) || '0.0'}
            </span>
            <StarRating value={summary?.average_rating || 0} size="md" />
          </div>
          <p className="text-xs text-gray-400 mt-1">Based on {total} review{total !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 md:col-span-2">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Rating Distribution</p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              // Sum 0.5-step reviews in this star bucket
              const full = dist[star] || 0;
              const half = dist[star - 0.5] || 0;
              const count = full + half;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-gray-600 flex items-center gap-1">
                    {star} <span className="text-yellow-400">★</span>
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-gray-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase">Filter:</span>
        {['all', '5', '4', '3', '2', '1'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === f
                ? 'bg-[#a37b3d] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All' : `${f}★`}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          Showing {filtered.length} of {reviews.length}
        </span>
      </div>

      {/* Reviews list */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 mx-auto border-3 border-gray-200 border-t-[#a37b3d] rounded-full animate-spin" />
          <p className="text-sm text-gray-400 mt-2">Loading reviews…</p>
        </div>
      ) : (
        <ReviewList
          reviews={filtered}
          showProduct
          showAiBadge
          emptyMessage="No reviews yet — buyers will see this section once they review your products"
        />
      )}
    </div>
  );
}

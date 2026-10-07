import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSellerAllReviews, getSellerRating } from '../../api/reviewNotificationApi';
import ReviewList from '../Reviews/ReviewList';
import StarRating from '../Reviews/StarRating';
import NotificationBell from '../Common/NotificationBell';
import SellerPageHero from '../Common/SellerPageHero';

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
    <div className="space-y-6 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Page Hero */}
      <SellerPageHero
        badge="Reputation & Feedback"
        title="Client Reviews & Ratings"
        subtitle="Review authentic buyer testimonials, ratings breakdown, and client satisfaction across your bridal and wedding collections."
        imageKey="reviews"
        rightSlot={
          <div className="flex items-center gap-3">
            <NotificationBell
              userId={sellerId}
              role="seller"
              onNavigate={(path) => navigate(path)}
            />
            <button
              onClick={load}
              className="px-4 py-2.5 bg-white/80 hover:bg-white text-stone-700 border border-[#EADBCC] rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all hover:border-[#9B7036] hover:text-[#9B7036]"
            >
              <span>↻</span> Refresh
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Rating Score Card */}
        <div className="bg-white rounded-3xl border border-[#EFEAE4] p-6 shadow-luxury flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] text-[11px] font-bold tracking-wider uppercase mb-3">
              <span>★</span> Merchant Score
            </div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Overall Rating</p>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="font-serif text-5xl font-bold text-stone-900">
                {summary?.average_rating?.toFixed(1) || '0.0'}
              </span>
              <span className="text-stone-400 font-serif text-lg">/ 5.0</span>
            </div>
          </div>

          <div className="pt-4 border-t border-[#FAF7F2] mt-4">
            <StarRating value={summary?.average_rating || 0} size="md" />
            <p className="text-xs text-stone-500 mt-2">
              Aggregated across <span className="font-semibold text-stone-800">{total}</span> verified buyer review{total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Rating Distribution Histogram */}
        <div className="bg-white rounded-3xl border border-[#EFEAE4] p-6 shadow-luxury md:col-span-2">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4">Rating Breakdown</p>
          <div className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const full = dist[star] || 0;
              const half = dist[star - 0.5] || 0;
              const count = full + half;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <span className="w-14 text-stone-600 font-medium flex items-center gap-1">
                    <span className="font-bold text-stone-800">{star}</span>
                    <span className="text-amber-400">★</span>
                  </span>
                  <div className="flex-1 bg-[#FAF7F2] rounded-full h-3 overflow-hidden border border-[#EFEAE4]">
                    <div
                      className="h-3 bg-gradient-to-r from-[#9B7036] to-[#ECD4A8] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-stone-500 font-medium">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap bg-white/70 backdrop-blur-sm p-3 rounded-2xl border border-[#EFEAE4]">
        <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mr-2">Filter Reviews:</span>
        {['all', '5', '4', '3', '2', '1'].map((f) => {
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#9B7036] to-[#7d5624] text-white shadow-sm shadow-[#9B7036]/20'
                  : 'bg-white text-stone-600 border border-[#EFEAE4] hover:border-[#ECD4A8] hover:text-[#9B7036]'
              }`}
            >
              {f === 'all' ? 'All Reviews' : `${f} ★ Stars`}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-stone-400">
          Showing <span className="font-semibold text-stone-700">{filtered.length}</span> of {reviews.length}
        </span>
      </div>

      {/* Reviews list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-stone-500">
          <div className="w-10 h-10 border-3 border-[#FAF3E8] border-t-[#9B7036] rounded-full animate-spin mb-3"></div>
          <p className="text-sm font-medium font-serif italic text-stone-600">Retrieving feedback...</p>
        </div>
      ) : (
        <ReviewList
          reviews={filtered}
          showProduct
          showAiBadge
          emptyMessage="No reviews recorded in this category yet — reviews submitted by clients will appear here."
        />
      )}
    </div>
  );
}

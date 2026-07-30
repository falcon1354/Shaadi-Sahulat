import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveImageUrl } from '../../api/sellerApi';

const BANNER_API = 'http://localhost:5000/api/banners/active';

export default function DealOfTheDayBanner({ categoryId }) {
  const navigate = useNavigate();
  const [banners, setBanners] = useState([]);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState('next'); // for slide animation

  useEffect(() => {
    fetch(BANNER_API)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.banners?.length) {
          // Filter banners by category if categoryId prop is provided
          let filtered = data.banners;
          if (categoryId) {
            filtered = data.banners.filter(b =>
              (b.link_type === 'category' && b.link_value === categoryId) ||
              b.category_id === categoryId
            );
          } else {
            // On homepage (no categoryId), show "All marketplace" banners
            filtered = data.banners.filter(b =>
              !b.link_type || b.link_type !== 'category' || !b.link_value || !b.category_id
            );
            // If no generic banners exist, show all (fallback)
            if (filtered.length === 0) filtered = data.banners;
          }
          setBanners(filtered);
        }
      })
      .catch(() => {});
  }, [categoryId]);

  // Auto-rotate every 5 seconds with continuous loop
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setDirection('next');
      setCurrent(c => (c + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (!banners.length) return null;

  const banner = banners[current];

  const handleClick = () => {
    if (banner.link_type === 'product' && banner.link_value) {
      navigate(`/buyer/marketplace`);
    } else if (banner.link_type === 'category' && banner.link_value) {
      navigate(`/buyer/marketplace`);
    } else if (banner.link_type === 'custom_url' && banner.link_value) {
      window.open(banner.link_value, '_blank', 'noopener,noreferrer');
    }
  };

  const goTo = (index) => {
    setDirection(index > current ? 'next' : 'prev');
    setCurrent(index);
  };

  const slideTransform = direction === 'next' ? 'translateX(-100%)' : 'translateX(100%)';
  const slideEnterTransform = direction === 'next' ? 'translateX(100%)' : 'translateX(-100%)';

  return (
    <div className="mb-8">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg animate-pulse">🔥</span>
        <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">Deal of the Day</h2>
        {banners.length > 1 && (
          <span className="text-xs text-gray-400 ml-auto">
            {current + 1} / {banners.length}
          </span>
        )}
      </div>

      {/* Vertical Hero Slider */}
      <div
        onClick={handleClick}
        className="relative group cursor-pointer rounded-3xl overflow-hidden shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-500 h-64 sm:h-80"
      >
        {/* Slide container with CSS transform animation */}
        <div className="relative w-full h-full overflow-hidden">
          {/* Previous slide (exit) */}
          <div
            key={`exit-${current}`}
            className="absolute inset-0 transition-all duration-700 ease-in-out opacity-0"
            style={{ transform: slideTransform }}
          >
            <img
              src={resolveImageUrl(banners[current > 0 ? current - 1 : banners.length - 1]?.image_url)}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          {/* Current slide (enter/active) */}
          <div
            key={`active-${current}`}
            className="absolute inset-0 transition-all duration-700 ease-in-out"
            style={{ transform: 'translateX(0)', opacity: 1 }}
          >
            <img
              src={resolveImageUrl(banner.image_url)}
              alt={banner.title || 'Deal of the Day'}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          {/* Next slide preload */}
          {banners.length > 1 && (
            <div
              key={`preload-${(current + 1) % banners.length}`}
              className="absolute inset-0 transition-all duration-700 ease-in-out opacity-0"
              style={{ transform: slideEnterTransform }}
            >
              <img
                src={resolveImageUrl(banners[(current + 1) % banners.length]?.image_url)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        {/* Banner Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
          {banner.title && (
            <h3 className="text-white text-xl sm:text-2xl font-extrabold drop-shadow-lg mb-1">
              {banner.title}
            </h3>
          )}
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white text-xs font-bold rounded-full border border-white/30">
              {banner.link_type === 'product' ? '🛍️ Shop Now' : banner.link_type === 'category' ? '🏷️ Browse Category' : '🔗 Learn More'}
            </span>
          </div>
        </div>

        {/* Animated corner badge */}
        <div className="absolute top-4 right-4 z-10">
          <span className="px-3 py-1.5 bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-black rounded-full shadow-lg flex items-center gap-1.5">
            <span className="animate-bounce">⚡</span> LIMITED TIME
          </span>
        </div>
      </div>

      {/* Pagination dots */}
      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? 'bg-[#a37b3d] w-6'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveImageUrl } from '../../api/sellerApi';

const BANNER_API = 'http://localhost:5000/api/banners/active';

export default function DealOfTheDayBanner({ categoryId, storefront }) {
  const navigate = useNavigate();
  const [banners, setBanners] = useState([]);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState('next');

  useEffect(() => {
    let url = BANNER_API;
    const params = new URLSearchParams();
    if (storefront) params.set('storefront', storefront);
    if (categoryId) params.set('category_id', categoryId);
    if (params.toString()) url += '?' + params.toString();

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.banners?.length) {
          let filtered = data.banners;
          if (categoryId) {
            filtered = data.banners.filter(b =>
              (b.link_type === 'category' && b.link_value === categoryId) ||
              b.category_id === categoryId
            );
          }
          if (filtered.length === 0) filtered = data.banners;
          setBanners(filtered);
        }
      })
      .catch(() => {});
  }, [categoryId, storefront]);

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
      navigate(`/buyer/${storefront === 'thrift' ? 'thrift' : 'marketplace'}`);
    } else if (banner.link_type === 'category' && banner.link_value) {
      navigate(`/buyer/${storefront === 'thrift' ? 'thrift' : 'marketplace'}`);
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

  const isThrift = storefront === 'thrift';
  const accentFrom = isThrift ? 'from-emerald-600 to-teal-500' : 'from-red-500 to-orange-500';
  const titleColor = isThrift ? 'text-emerald-900' : 'text-gray-900';

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg animate-pulse">{isThrift ? '♻️' : '🔥'}</span>
        <h2 className={`text-lg font-extrabold ${titleColor} tracking-tight`}>
          {isThrift ? 'Thrift Deals' : 'Deal of the Day'}
        </h2>
        {banners.length > 1 && (
          <span className="text-xs text-gray-400 ml-auto">
            {current + 1} / {banners.length}
          </span>
        )}
      </div>

      <div
        onClick={handleClick}
        className="relative group cursor-pointer rounded-3xl overflow-hidden shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-500 h-64 sm:h-80"
      >
        <div className="relative w-full h-full overflow-hidden">
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

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

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

        <div className="absolute top-4 right-4 z-10">
          <span className={`px-3 py-1.5 bg-gradient-to-r ${accentFrom} text-white text-xs font-black rounded-full shadow-lg flex items-center gap-1.5`}>
            <span className="animate-bounce">⚡</span> {isThrift ? 'THRIFT DEAL' : 'LIMITED TIME'}
          </span>
        </div>
      </div>

      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? isThrift ? 'bg-emerald-600 w-6' : 'bg-[#a37b3d] w-6'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function DealOfTheDayBanner({ categoryId = 'ALL' }) {
  const [banners, setBanners] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Path resolution helper for static upload serving
  const resolveImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:5000/${path.replace(/^\/+/, '')}`;
  };

  useEffect(() => {
    axios.get(`/api/banners/active?categoryId=${categoryId}`)
      .then(res => setBanners(res.data))
      .catch(err => console.error(err));
  }, [categoryId]);

  // 5-second continuous vertical rotation
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners]);

  if (!banners.length) return null;

  return (
    <div className="my-12 w-full max-w-6xl mx-auto overflow-hidden relative h-64 rounded-xl shadow-lg bg-gray-100">
      <div 
        className="transition-transform duration-700 ease-in-out flex flex-col h-full"
        style={{ transform: `translateY(-${currentIndex * 100}%)` }}
      >
        {banners.map((banner) => (
          <div key={banner._id} className="h-64 flex-shrink-0 w-full relative">
            <a href={`/product/${banner.targetProductId}`}>
              <img 
                src={resolveImageUrl(banner.imageUrl)} 
                alt={banner.title} 
                className="w-full h-full object-cover rounded-xl"
              />
              <div className="absolute bottom-4 left-4 bg-black/60 text-white p-3 rounded">
                <h3 className="font-bold text-lg">{banner.title}</h3>
              </div>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
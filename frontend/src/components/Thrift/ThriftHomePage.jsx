import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import sellerApi, { resolveImageUrl } from '../../api/sellerApi';
import DealOfTheDayBanner from '../Common/DealOfTheDayBanner';
import { useCategories } from '../../hooks/useCategories';
import ThriftProductCard from './ThriftProductCard';

export default function ThriftHomePage({ buyer, onProductClick }) {
  const navigate = useNavigate();
  const { categories } = useCategories();
  const [products, setProducts] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Filter categories for thrift
  const thriftCategories = categories.filter(c =>
    c.storefront === 'thrift' || c.storefront === 'both' || !c.storefront
  );

  useEffect(() => {
    loadThriftProducts();
  }, [selectedCategory]);

  const loadThriftProducts = async () => {
    setLoading(true);
    try {
      const params = {
        marketplace_type: 'thrift',
        condition: 'Thrift',
        sort_by: 'newest',
        limit: 40,
      };
      if (selectedCategory) {
        params.major_category = selectedCategory;
      }
      const data = await sellerApi.getPublicProducts(params);
      const prods = data.products || [];
      setProducts(prods);
      // Featured: products with discount or best seller
      setFeatured(prods.filter(p => p.is_hot_deal || p.is_best_seller || p.discount_price).slice(0, 8));
    } catch (e) {
      console.error('Failed to load thrift products:', e);
    }
    setLoading(false);
  };

  const handleProductClick = (product) => {
    if (onProductClick) {
      onProductClick(product);
    } else {
      navigate(`/buyer/thrift/${product.product_id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Thrift-specific Navbar with distinct styling */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                <span className="text-3xl">♻️</span> Thrift Marketplace
              </h1>
              <p className="text-emerald-100 text-sm mt-1">Pre-loved items at amazing prices — every item is one-of-a-kind</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/buyer/marketplace')}
                className="px-4 py-2 bg-white/20 backdrop-blur-md text-white text-sm font-bold rounded-xl hover:bg-white/30 transition-all border border-white/30"
              >
                🛍️ New Marketplace
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* Hero Banner Slider — Thrift-specific banners */}
        <DealOfTheDayBanner storefront="thrift" />

        {/* Category Section */}
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 mb-3 flex items-center gap-2">
            <span>🏷️</span> Browse by Category
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                !selectedCategory
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-emerald-300'
              }`}
            >
              All Thrift
            </button>
            {thriftCategories.map(cat => (
              <button
                key={cat.category_id}
                onClick={() => setSelectedCategory(cat.category_id)}
                className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  selectedCategory === cat.category_id
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-emerald-300'
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Thrift Products */}
        {featured.length > 0 && (
          <div>
            <h2 className="text-lg font-extrabold text-gray-900 mb-3 flex items-center gap-2">
              <span>⭐</span> Featured Thrift Deals
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {featured.map(product => (
                <ThriftProductCard
                  key={product.product_id}
                  product={product}
                  onClick={() => handleProductClick(product)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recently Added Products */}
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 mb-3 flex items-center gap-2">
            <span>🕐</span> Recently Added
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-emerald-600 rounded-full animate-spin mr-3" />
              Loading thrift items...
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">♻️</p>
              <h3 className="text-lg font-bold text-gray-800 mb-1">No Thrift Items Yet</h3>
              <p className="text-sm text-gray-500">Check back soon for new pre-loved items!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(product => (
                <ThriftProductCard
                  key={product.product_id}
                  product={product}
                  onClick={() => handleProductClick(product)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Final Sale Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
          <p className="text-amber-800 font-bold text-sm flex items-center justify-center gap-2">
            <span>⚠️</span> Thrift items are sold as-is, final sale — no standard returns
          </p>
          <p className="text-amber-600 text-xs mt-1">Please review condition and photos carefully before purchasing</p>
        </div>
      </div>
    </div>
  );
}

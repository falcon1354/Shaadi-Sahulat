import React from 'react';
import ProductUpload from './ProductUpload';

export default function SellerPage({ onLogin }) {
  const seller = (() => {
    const stored = localStorage.getItem('ss_seller');
    if (stored) {
      try { return JSON.parse(stored); } catch (_) {}
    }
    return null;
  })();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upload Product</h1>
          {seller && (
            <p className="text-sm text-gray-500 mt-1">
              Seller: <span className="font-semibold text-purple-600">{seller.name}</span>
              &nbsp;·&nbsp;<span className="text-gray-400">{seller.seller_id}</span>
            </p>
          )}
        </div>
      </div>

      <ProductUpload
        sellerId={seller?.seller_id}
      />
    </div>
  );
}

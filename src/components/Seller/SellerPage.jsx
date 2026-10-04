import React from 'react';
import ProductUpload from './ProductUpload';
import { useAuth } from '../../context/AuthContext';

export default function SellerPage({ onLogin }) {
  // Server-verified session (no localStorage identity).
  const { seller } = useAuth();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Upload Product</h1>
          {seller && (
            <p className="text-sm text-gray-500 mt-1">
              Seller: <span className="font-semibold text-primary-900">{seller.name}</span>
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

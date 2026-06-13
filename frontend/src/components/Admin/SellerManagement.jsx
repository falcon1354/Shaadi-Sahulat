import React, { useState, useEffect } from 'react';
import adminApi from '../../api/adminApi';
import { resolveImageUrl } from '../../api/sellerApi';

const LEVEL_BADGE = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-purple-100 text-purple-700',
};

export default function SellerManagement() {
  const [sellers, setSellers]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [products, setProducts]   = useState([]);
  const [prodLoad, setProdLoad]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [confirm, setConfirm]     = useState(null); // { type: 'remove'|'freeze'|'unfreeze', product }

  useEffect(() => {
    adminApi.getAllSellers().then(r => {
      setSellers(r.sellers || []);
      setLoading(false);
    });
  }, []);

  const openSeller = async (seller) => {
    setSelected(seller);
    setProdLoad(true);
    const r = await adminApi.getSellerProducts(seller.seller_id);
    setProducts(r.products || []);
    setProdLoad(false);
  };

  const doAction = async () => {
    if (!confirm) return;
    const { type, product } = confirm;
    setConfirm(null);
    if (type === 'remove') {
      await adminApi.removeProduct(product.product_id);
      setProducts(prev => prev.filter(p => p.product_id !== product.product_id));
    } else if (type === 'freeze') {
      await adminApi.freezeProduct(product.product_id);
      setProducts(prev => prev.map(p => p.product_id === product.product_id
        ? { ...p, availability_status: 'frozen' } : p));
    } else if (type === 'unfreeze') {
      await adminApi.unfreezeProduct(product.product_id);
      setProducts(prev => prev.map(p => p.product_id === product.product_id
        ? { ...p, availability_status: 'available' } : p));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading sellers…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Seller Management</h1>
        <p className="text-sm text-gray-500 mt-1">{sellers.length} sellers registered</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sellers list */}
        <div className="lg:col-span-1 space-y-3">
          {sellers.map(s => (
            <button
              key={s.seller_id}
              onClick={() => openSeller(s)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selected?.seller_id === s.seller_id
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-800 text-sm">{s.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_BADGE[s.level] || LEVEL_BADGE[1]}`}>
                  L{s.level}
                </span>
              </div>
              <p className="text-xs text-gray-400">{s.email}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>📦 {s.product_count} products</span>
                <span>📍 {s.city || '—'}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Products panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
              Select a seller to view their products
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{selected.name}</h3>
                  <p className="text-xs text-gray-400">{products.length} products</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>

              {prodLoad ? (
                <div className="p-8 text-center text-gray-400">Loading products…</div>
              ) : products.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No products found.</div>
              ) : (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
                  {products.map(prod => {
                    const frozen = prod.availability_status === 'frozen';
                    return (
                      <div key={prod.product_id} className={`border rounded-xl overflow-hidden ${frozen ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100'}`}>
                        <div className="h-32 bg-gray-100 overflow-hidden relative">
                          <img
                            src={resolveImageUrl(prod.primary_image_url)}
                            alt={prod.title}
                            className={`w-full h-full object-cover ${frozen ? 'opacity-50 grayscale' : ''}`}
                            onError={e => { e.target.style.display='none'; }}
                          />
                          {frozen && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-lg font-semibold">FROZEN</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-semibold text-gray-700 line-clamp-1">{prod.title}</p>
                          <p className="text-xs text-purple-600 font-bold mt-0.5">PKR {prod.price?.toLocaleString()}</p>
                          <div className="flex gap-2 mt-2">
                            {!frozen ? (
                              <button
                                onClick={() => setConfirm({ type: 'freeze', product: prod })}
                                className="flex-1 text-xs py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                              >
                                🧊 Freeze
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirm({ type: 'unfreeze', product: prod })}
                                className="flex-1 text-xs py-1.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors"
                              >
                                ✅ Unfreeze
                              </button>
                            )}
                            <button
                              onClick={() => setConfirm({ type: 'remove', product: prod })}
                              className="flex-1 text-xs py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                            >
                              🗑 Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-800 text-lg mb-2">
              {confirm.type === 'remove'   ? '🗑 Remove Product'   :
               confirm.type === 'freeze'   ? '🧊 Freeze Product'   :
                                             '✅ Unfreeze Product'}
            </h3>
            <p className="text-gray-600 text-sm mb-1">
              <span className="font-semibold">{confirm.product.title}</span>
            </p>
            <p className="text-gray-500 text-xs mb-5">
              {confirm.type === 'remove'
                ? 'This will permanently delete the product from MongoDB and remove its images from the server.'
                : confirm.type === 'freeze'
                ? 'Product will be hidden from buyers but remain in the database. Seller sees it as frozen.'
                : 'Product will become visible to buyers again.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={doAction}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold ${
                  confirm.type === 'remove' ? 'bg-red-500 hover:bg-red-600' :
                  confirm.type === 'freeze' ? 'bg-blue-500 hover:bg-blue-600' :
                                             'bg-green-500 hover:bg-green-600'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

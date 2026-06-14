import Link from 'next/link';
import { fetchPublicProducts, resolveImageUrl } from '../lib/api';

export const metadata = {
  title: 'Browse Products — ShaadiSahulat',
  description: 'Explore verified wedding products from trusted sellers across Pakistan.',
};

export default async function HomePage() {
  const { products } = await fetchPublicProducts({ limit: 12 });

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
          Wedding Products,{' '}
          <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            Made Accessible
          </span>
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto text-lg">
          Browse verified sellers, compare prices, and find perfect wedding items — all in one place.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <a
            href="http://localhost:5173"
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            Open Full App →
          </a>
        </div>
      </section>

      {/* Product Grid */}
      {products.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Latest Products</h2>
            <span className="text-sm text-gray-400">{products.length} shown</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => {
              const imageUrl = resolveImageUrl(p.primary_image_url);
              const hasDiscount = p.discount_price && p.discount_price < p.price;

              return (
                <Link
                  key={p.product_id}
                  href={`/products/${p.product_id}`}
                  className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-purple-200 transition-all overflow-hidden flex flex-col"
                >
                  {/* Image */}
                  <div className="relative aspect-square bg-gray-50 overflow-hidden">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">
                        📦
                      </div>
                    )}
                    {hasDiscount && (
                      <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {p.discount_pct ? `${Math.round(p.discount_pct)}% OFF` : 'SALE'}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 flex flex-col flex-1">
                    <p className="text-xs text-purple-500 font-medium mb-0.5 capitalize">
                      {p.major_category?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1 group-hover:text-purple-700 transition-colors">
                      {p.title}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {hasDiscount ? (
                        <>
                          <span className="text-sm font-bold text-green-600">
                            PKR {p.discount_price.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-400 line-through">
                            PKR {p.price.toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-purple-700">
                          PKR {p.price?.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
                      <span>{p.seller_name || 'Seller'}</span>
                      {p.city && <span>📍 {p.city}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {products.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🛍️</p>
          <p className="text-gray-500">No products available yet. Check back soon!</p>
        </div>
      )}
    </div>
  );
}

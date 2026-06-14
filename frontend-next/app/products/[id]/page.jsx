import { notFound } from 'next/navigation';
import { fetchProduct, resolveImageUrl } from '../../../lib/api';
import ProductDetail from '../../../components/ProductDetail';

/**
 * Generate SEO metadata per product — runs on the server before rendering.
 * This gives each product its own <title>, <meta description>, and OpenGraph tags.
 */
export async function generateMetadata({ params }) {
  const product = await fetchProduct(params.id);

  if (!product) {
    return {
      title: 'Product Not Found',
      description: 'This product could not be found on ShaadiSahulat.',
    };
  }

  const description = product.description
    ? product.description.slice(0, 160)
    : `${product.title} — PKR ${product.price?.toLocaleString()} on ShaadiSahulat marketplace.`;

  const imageUrl = resolveImageUrl(product.primary_image_url);

  return {
    title: product.title,
    description,
    openGraph: {
      title: product.title,
      description,
      type: 'website',
      images: imageUrl ? [{ url: imageUrl, width: 800, height: 800, alt: product.title }] : [],
      siteName: 'ShaadiSahulat',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
    other: {
      'product:price:amount': String(product.discount_price || product.price || 0),
      'product:price:currency': 'PKR',
    },
  };
}

/**
 * Product Page — Server Component
 *
 * This page is rendered on the server with real product data baked into the HTML.
 * The URL /products/[id] is directly accessible, shareable, and SEO-indexed.
 */
export default async function ProductPage({ params }) {
  const product = await fetchProduct(params.id);

  if (!product) {
    notFound();
  }

  return <ProductDetail product={product} />;
}

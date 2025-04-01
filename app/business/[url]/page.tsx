import Link from 'next/link';
import { getBusinessDetails } from '@/lib/db';
import DateFormatter from '@/app/components/DateFormatter';

interface PageProps {
  params: {
    url: string;
  }
}

async function getBusinessByUrl(url: string) {
  try {
    // URL comes encoded from the route, so we need to decode it
    const decodedUrl = decodeURIComponent(url);
    return await getBusinessDetails(decodedUrl);
  } catch (error) {
    console.error('Error fetching business:', error);
    return null;
  }
}

export default async function BusinessPage({ params }: PageProps) {
  const business = await getBusinessByUrl(params.url);

  if (!business) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> Business not found</span>
        </div>
        <div className="mt-4">
          <Link href="/" className="flex items-center text-blue-600 hover:underline">
            <span className="mr-1">←</span> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center mb-6">
        <Link href="/" className="flex items-center text-blue-600 hover:underline mr-4">
          <span className="mr-1">←</span> Back
        </Link>
        <h1 className="text-2xl font-bold">Business Details</h1>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2 truncate">{business.title || 'No Title'}</h2>
          <a 
            href={business.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {business.url}
          </a>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium mb-2">Basic Information</h3>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Status</div>
                <div>
                  <span className={`inline-block px-2 py-1 text-sm rounded-full ${
                    business.status === 'completed' ? 'bg-green-100 text-green-800' :
                    business.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                    business.status === 'error' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {business.status}
                  </span>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Sitemap Source</div>
                <div className="truncate">
                  <span className="text-gray-700">{business.sitemap_url || 'Unknown'}</span>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Created At</div>
                <div className="text-gray-700">
                  <DateFormatter dateString={business.created_at} />
                </div>
              </div>
              
              {business.processed_at && (
                <div>
                  <div className="text-sm text-gray-500">Processed At</div>
                  <div className="text-gray-700">
                    <DateFormatter dateString={business.processed_at} />
                  </div>
                </div>
              )}
              
              <div>
                <div className="text-sm text-gray-500">Last Updated</div>
                <div className="text-gray-700">
                  <DateFormatter dateString={business.updated_at} />
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-2">Contact Information</h3>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Email</div>
                <div className="text-gray-700">
                  {business.email ? (
                    <a href={`mailto:${business.email}`} className="text-blue-600 hover:underline">
                      {business.email}
                    </a>
                  ) : (
                    'Not found'
                  )}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Address</div>
                <div className="text-gray-700 whitespace-pre-line">
                  {business.address || 'Not found'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {business.description && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Description</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 whitespace-pre-line">{business.description}</p>
            </div>
          </div>
        )}

        {business.error_message && (
          <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4">
            <h3 className="text-lg font-medium mb-2 text-red-700">Error</h3>
            <p className="text-red-600">{business.error_message}</p>
          </div>
        )}
      </div>
    </div>
  );
} 
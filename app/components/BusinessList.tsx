"use client";

import { useState, useEffect } from "react";
import { DateFormatter } from "./DateFormatter";

interface Business {
  id: number;
  url: string;
  sitemap_url: string | null;
  title: string | null;
  description: string | null;
  email: string | null;
  address: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export function BusinessList() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchBusinesses();
    
    // Actualizar cada 5 segundos
    const interval = setInterval(() => {
      fetchBusinesses();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchBusinesses = async () => {
    try {
      const response = await fetch('/api/businesses?limit=50');
      if (!response.ok) throw new Error('Failed to fetch businesses');
      
      const data = await response.json();
      setBusinesses(data.businesses || []);
    } catch (err) {
      console.error('Error fetching businesses:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Completed</span>;
      case 'error':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Error</span>;
      case 'processing':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Processing</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const viewDetails = (business: Business) => {
    setSelectedBusiness(business);
    setShowModal(true);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">Recent Businesses</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3">URL</th>
              <th scope="col" className="px-6 py-3">Title</th>
              <th scope="col" className="px-6 py-3">Email</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Updated</th>
              <th scope="col" className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {businesses.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-4">
                  No business data found
                </td>
              </tr>
            ) : (
              businesses.map((business) => (
                <tr key={business.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 max-w-xs truncate">
                    {business.url}
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate">
                    {business.title || "-"}
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate">
                    {business.email || "-"}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(business.status)}
                  </td>
                  <td className="px-6 py-4">
                    <DateFormatter date={business.processed_at || business.created_at} />
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => viewDetails(business)}
                      className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-xs px-3 py-1.5"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de detalles */}
      {showModal && selectedBusiness && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Business Details</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">URL</h3>
                <p className="text-sm break-all">{selectedBusiness.url}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Sitemap URL</h3>
                <p className="text-sm break-all">{selectedBusiness.sitemap_url || "N/A"}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Title</h3>
                <p className="text-sm">{selectedBusiness.title || "N/A"}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Description</h3>
                <p className="text-sm">{selectedBusiness.description || "N/A"}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Email</h3>
                <p className="text-sm">{selectedBusiness.email || "N/A"}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Address</h3>
                <p className="text-sm">{selectedBusiness.address || "N/A"}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Status</h3>
                <p className="text-sm">{selectedBusiness.status}</p>
              </div>
              
              {selectedBusiness.error_message && (
                <div>
                  <h3 className="text-lg font-medium text-red-600">Error</h3>
                  <p className="text-sm text-red-600">{selectedBusiness.error_message}</p>
                </div>
              )}
              
              <div>
                <h3 className="text-lg font-medium">Created At</h3>
                <p className="text-sm">
                  <DateFormatter date={selectedBusiness.created_at} />
                </p>
              </div>
              
              {selectedBusiness.processed_at && (
                <div>
                  <h3 className="text-lg font-medium">Processed At</h3>
                  <p className="text-sm">
                    <DateFormatter date={selectedBusiness.processed_at} />
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setShowModal(false)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
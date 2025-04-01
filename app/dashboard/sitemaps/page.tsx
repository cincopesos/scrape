"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DateFormatter } from "@/app/components/DateFormatter";

interface SitemapStats {
  sitemap_url: string;
  total: number;
  completed: number;
  pending: number;
  processing: number;
  error: number;
  with_email: number;
  last_added: string;
}

export default function SitemapsPage() {
  const [sitemaps, setSitemaps] = useState<string[]>([]);
  const [stats, setStats] = useState<SitemapStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  useEffect(() => {
    fetchSitemaps();
    
    // Actualizar cada 30 segundos
    const interval = setInterval(() => {
      fetchSitemaps();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchSitemaps = async () => {
    try {
      setLoading(true);
      const timestamp = new Date().getTime() + Math.random();
      const response = await fetch(`/api/sitemaps?_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch sitemaps');
      
      const data = await response.json();
      setSitemaps(data.sitemaps || []);
      setStats(data.stats || []);
    } catch (err) {
      console.error('Error al cargar sitemaps:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };
  
  // Filtrar sitemaps según búsqueda
  const filteredSitemaps = stats.filter(sitemap => {
    if (!searchQuery) return true;
    return sitemap.sitemap_url.toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  // Calcular totales
  const totals = stats.reduce((acc, sitemap) => {
    acc.total += sitemap.total;
    acc.completed += sitemap.completed;
    acc.pending += sitemap.pending;
    acc.processing += sitemap.processing;
    acc.error += sitemap.error;
    acc.with_email += sitemap.with_email;
    return acc;
  }, { total: 0, completed: 0, pending: 0, processing: 0, error: 0, with_email: 0 });
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Sitemaps Procesados</h1>
        <div className="flex space-x-2">
          <Link 
            href="/dashboard"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Volver al Dashboard
          </Link>
          <button
            onClick={fetchSitemaps}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Actualizar Datos
          </button>
        </div>
      </div>
      
      {/* Estadísticas globales */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{sitemaps.length}</div>
          <div className="text-sm text-gray-600">Sitemaps</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{totals.total}</div>
          <div className="text-sm text-gray-600">URLs Totales</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{totals.completed}</div>
          <div className="text-sm text-gray-600">Completadas</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{totals.pending + totals.processing}</div>
          <div className="text-sm text-gray-600">Pendientes</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{totals.error}</div>
          <div className="text-sm text-gray-600">Errores</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{totals.with_email}</div>
          <div className="text-sm text-gray-600">Con Email</div>
        </div>
      </div>
      
      {/* Filtro de búsqueda */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex items-center">
          <div className="flex-grow">
            <label htmlFor="search-query" className="block text-sm font-medium text-gray-700 mb-1">Buscar Sitemap</label>
            <div className="flex">
              <input 
                id="search-query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por URL de sitemap..."
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Tabla de sitemaps */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold">Listado de Sitemaps</h2>
          <div className="text-sm text-gray-500">
            Mostrando {filteredSitemaps.length} de {stats.length} sitemaps
          </div>
        </div>
        
        {loading && stats.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <svg className="animate-spin mx-auto h-8 w-8 text-gray-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>Cargando sitemaps...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-500">
            <p>Error al cargar sitemaps: {error}</p>
            <button 
              onClick={fetchSitemaps} 
              className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Reintentar
            </button>
          </div>
        ) : filteredSitemaps.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p>No se encontraron sitemaps que coincidan con la búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sitemap</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total URLs</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completadas</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pendientes</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Errores</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Con Email</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última URL</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSitemaps.map((sitemap) => (
                  <tr key={sitemap.sitemap_url} className="hover:bg-gray-50">
                    <td className="px-6 py-4 max-w-xs truncate">
                      <a 
                        href={sitemap.sitemap_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium truncate block"
                        title={sitemap.sitemap_url}
                      >
                        {sitemap.sitemap_url}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sitemap.total}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="text-green-600 font-medium">{sitemap.completed}</span>
                      {sitemap.total > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({Math.round((sitemap.completed / sitemap.total) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="text-yellow-600 font-medium">{sitemap.pending + sitemap.processing}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="text-red-600 font-medium">{sitemap.error}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="text-blue-600 font-medium">{sitemap.with_email}</span>
                      {sitemap.completed > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({Math.round((sitemap.with_email / sitemap.completed) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sitemap.last_added ? (
                        <DateFormatter dateString={sitemap.last_added} format="dd MMM yyyy HH:mm" />
                      ) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <Link 
                        href={`/dashboard?sitemap=${encodeURIComponent(sitemap.sitemap_url)}`}
                        className="text-blue-600 hover:bg-blue-100 px-3 py-1 rounded"
                      >
                        Ver URLs
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Última actualización: <DateFormatter dateString={new Date().toISOString()} format="dd MMM yyyy HH:mm:ss" /></p>
      </div>
    </div>
  );
} 
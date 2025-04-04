"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DateFormatter } from "@/app/components/DateFormatter";

interface Business {
  id: string;
  url: string;
  title?: string;
  email?: string;
  sitemap_url?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  error_message?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

function getStatusBadge(status?: string) {
  if (!status) return null;
  
  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pendiente' },
    processing: { color: 'bg-blue-100 text-blue-800', text: 'Procesando' },
    completed: { color: 'bg-green-100 text-green-800', text: 'Completado' },
    error: { color: 'bg-red-100 text-red-800', text: 'Error' }
  };
  
  const statusInfo = statusMap[status] || { color: 'bg-gray-100 text-gray-800', text: status };
  
  return (
    <span className={`${statusInfo.color} px-2 py-1 rounded-full text-xs font-medium`}>
      {statusInfo.text}
    </span>
  );
}

export default function DashboardPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSitemap, setCurrentSitemap] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sitemapFilter, setSitemapFilter] = useState<string>("all");
  const [uniqueSitemaps, setUniqueSitemaps] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [processStats, setProcessStats] = useState<any>({});
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  
  // Cargar datos al montar el componente
  useEffect(() => {
    fetchBusinesses();
    
    // Actualizar cada 10 segundos
    const interval = setInterval(() => {
      fetchBusinesses();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [currentPage, statusFilter, sitemapFilter, searchQuery]);
  
  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      // Añadir un timestamp aleatorio para evitar el caché
      const timestamp = new Date().getTime() + Math.random();
      
      // Si hay un sitemap seleccionado, añadir este filtro
      let queryParams = `limit=100&offset=${(currentPage - 1) * 100}&_t=${timestamp}`;
      if (sitemapFilter !== 'all') {
        queryParams += `&sitemap=${encodeURIComponent(sitemapFilter)}`;
      }
      
      // Si hay un estado seleccionado, añadir este filtro
      if (statusFilter !== 'all') {
        queryParams += `&status=${encodeURIComponent(statusFilter)}`;
      }
      
      // Si hay una búsqueda, añadir este filtro
      if (searchQuery) {
        queryParams += `&search=${encodeURIComponent(searchQuery)}`;
      }
      
      const response = await fetch(`/api/businesses?${queryParams}`, {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch businesses');
      
      const data = await response.json();
      
      // Filtrar URLs inválidas como "https" sin el resto
      const validBusinesses = data.businesses?.filter((b: any) => {
        return b.url && b.url.startsWith('http') && b.url.includes('.');
      }) || [];
      
      // Establecer el total de registros para la paginación
      setTotalRecords(data.total || validBusinesses.length);
      
      // Extraer los sitemaps únicos si es la primera vez o si se solicita todos los sitemaps
      if (uniqueSitemaps.length === 0 || sitemapFilter === 'all') {
        // Solicitar solo los sitemaps, que es una operación más ligera
        const sitemapsResponse = await fetch(`/api/sitemaps?_t=${timestamp}`);
        if (sitemapsResponse.ok) {
          const sitemapsData = await sitemapsResponse.json();
          setUniqueSitemaps(sitemapsData.sitemaps || []);
        }
      }
      
      setBusinesses(validBusinesses);
      
      // Obtener información del proceso actual y estadísticas
      const statsResponse = await fetch(`/api/extract?_t=${timestamp}`);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setCurrentSitemap(statsData.currentSitemap);
        
        // Actualizar las estadísticas correctamente
        // El backend debería proporcionar estos valores calculados adecuadamente
        const stats = statsData.stats || {};
        
        // Calcular estadísticas manualmente si es necesario
        if (stats.withEmail === undefined || stats.withEmail === 0) {
          // Hacer una solicitud adicional para obtener estadísticas precisas
          try {
            const emailStatsResponse = await fetch(`/api/stats?_t=${timestamp}`);
            if (emailStatsResponse.ok) {
              const emailStatsData = await emailStatsResponse.json();
              setProcessStats({
                ...stats,
                withEmail: emailStatsData.emailCount || 0,
                withDescription: emailStatsData.descriptionCount || 0,
                withAddress: emailStatsData.addressCount || 0
              });
            } else {
              setProcessStats(stats);
            }
          } catch (err) {
            console.error('Error al obtener estadísticas de emails:', err);
            setProcessStats(stats);
          }
        } else {
          setProcessStats(stats);
        }
      }
      
    } catch (err) {
      console.error('Error al cargar datos:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };
  
  // Filtrar los negocios según los filtros seleccionados
  const filteredBusinesses = businesses.filter(business => {
    // Filtrar por estado
    if (statusFilter !== "all" && business.status !== statusFilter) {
      return false;
    }
    
    // Filtrar por sitemap
    if (sitemapFilter !== "all" && business.sitemap_url !== sitemapFilter) {
      return false;
    }
    
    // Filtrar por búsqueda
    if (searchQuery && !business.url.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });
  
  // NUEVA FUNCIÓN: Manejar Exportación CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (sitemapFilter !== 'all') {
      params.set('sitemap', sitemapFilter);
    }
    
    const exportUrl = `/api/export/csv?${params.toString()}`;
    console.log('Triggering CSV export:', exportUrl);
    
    // Trigger download by navigating to the URL
    window.location.href = exportUrl;
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Panel de Control</h1>
        <div className="flex space-x-2">
          <Link 
            href="/"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Volver al Extractor
          </Link>
          <Link 
            href="/dashboard/sitemaps"
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Ver Sitemaps
          </Link>
          <button
            onClick={fetchBusinesses}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Actualizar Datos
          </button>
        </div>
      </div>
      
      {currentSitemap && (
        <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6 rounded-md shadow">
          <div className="flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="font-bold">Proceso activo: {currentSitemap}</p>
          </div>
        </div>
      )}
      
      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{totalRecords}</div>
          <div className="text-sm text-gray-600">URLs Totales</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{processStats.completed || 0}</div>
          <div className="text-sm text-gray-600">Completadas</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{processStats.withEmail || 0}</div>
          <div className="text-sm text-gray-600">Con Email</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{processStats.withAddress || 0}</div>
          <div className="text-sm text-gray-600">Con Dirección</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-xl font-bold">{uniqueSitemaps.length}</div>
          <div className="text-sm text-gray-600">
            <Link href="/dashboard/sitemaps" className="text-blue-600 hover:underline">
              Sitemaps Procesados
            </Link>
          </div>
        </div>
      </div>
      
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <h2 className="text-lg font-bold mb-3">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select 
              id="status-filter" 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="processing">Procesando</option>
              <option value="completed">Completados</option>
              <option value="error">Con Error</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="sitemap-filter" className="block text-sm font-medium text-gray-700 mb-1">Sitemap</label>
            <select 
              id="sitemap-filter" 
              value={sitemapFilter}
              onChange={(e) => setSitemapFilter(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos los sitemaps</option>
              {uniqueSitemaps.map((sitemap, index) => (
                <option key={index} value={sitemap}>
                  {sitemap}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="search-query" className="block text-sm font-medium text-gray-700 mb-1">Buscar URL</label>
            <div className="flex">
              <input 
                id="search-query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por URL..."
                className="w-full p-2 border border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCurrentPage(1); // Resetear a la primera página
                    fetchBusinesses();
                  }
                }}
              />
              <button
                onClick={() => {
                  setCurrentPage(1); // Resetear a la primera página
                  fetchBusinesses();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-r-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className="md:col-start-4">
            <button
              onClick={handleExportCsv}
              disabled={loading}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar CSV
            </button>
          </div>
        </div>
      </div>
      
      {/* Detalles completos del negocio (modal) */}
      {selectedBusiness && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Detalles completos</h2>
                <button 
                  onClick={() => setSelectedBusiness(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="font-bold text-gray-600">URL</div>
                    <a 
                      href={selectedBusiness.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-600 hover:underline break-all"
                    >
                      {selectedBusiness.url}
                    </a>
                  </div>
                  <div>
                    <div className="font-bold text-gray-600">Sitemap</div>
                    <a 
                      href={selectedBusiness.sitemap_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-600 hover:underline break-all"
                    >
                      {selectedBusiness.sitemap_url || 'No disponible'}
                    </a>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="font-bold text-gray-600">Estado</div>
                    <div>{getStatusBadge(selectedBusiness.status)}</div>
                    {selectedBusiness.error_message && (
                      <div className="mt-2 text-red-600">{selectedBusiness.error_message}</div>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-gray-600">Email</div>
                    {selectedBusiness.email ? (
                      <a 
                        href={`mailto:${selectedBusiness.email}`} 
                        className="text-blue-600 hover:underline"
                      >
                        {selectedBusiness.email}
                      </a>
                    ) : 'No disponible'}
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="font-bold text-gray-600">Título</div>
                  <div>{selectedBusiness.title || 'No disponible'}</div>
                </div>
                
                <div className="mb-4">
                  <div className="font-bold text-gray-600">Descripción</div>
                  <div>{selectedBusiness.description || 'No disponible'}</div>
                </div>
                
                <div className="mb-4">
                  <div className="font-bold text-gray-600">Dirección</div>
                  <div>{selectedBusiness.address || 'No disponible'}</div>
                </div>
                
                {(selectedBusiness.latitude && selectedBusiness.longitude) && (
                  <div className="mb-4">
                    <div className="font-bold text-gray-600">Coordenadas</div>
                    <div>Latitud: {selectedBusiness.latitude}, Longitud: {selectedBusiness.longitude}</div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="font-bold text-gray-600">Creado</div>
                    <div><DateFormatter dateString={selectedBusiness.created_at} /></div>
                  </div>
                  <div>
                    <div className="font-bold text-gray-600">Actualizado</div>
                    <div>{selectedBusiness.updated_at ? <DateFormatter dateString={selectedBusiness.updated_at} /> : 'No disponible'}</div>
                  </div>
                  <div>
                    <div className="font-bold text-gray-600">Procesado</div>
                    <div>{selectedBusiness.processed_at ? <DateFormatter dateString={selectedBusiness.processed_at} /> : 'No disponible'}</div>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-between">
                  <button 
                    onClick={() => setSelectedBusiness(null)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-800"
                  >
                    Cerrar
                  </button>
                  <a 
                    href={selectedBusiness.url} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                  >
                    Abrir sitio web
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Tabla de datos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold">Listado de URLs</h2>
          <div className="text-sm text-gray-500">
            Mostrando {filteredBusinesses.length} de {businesses.length} URLs
          </div>
        </div>
        
        {loading && businesses.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <svg className="animate-spin mx-auto h-8 w-8 text-gray-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>Cargando datos...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-500">
            <p>Error al cargar datos: {error}</p>
            <button 
              onClick={fetchBusinesses} 
              className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Reintentar
            </button>
          </div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p>No se encontraron URLs que coincidan con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sitemap</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalles</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBusinesses.map((business) => (
                  <tr key={business.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 max-w-xs truncate">
                      <a 
                        href={business.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium truncate block"
                        title={business.url}
                      >
                        {business.url}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={business.sitemap_url || ''}>
                      {business.sitemap_url ? (
                        <a 
                          href={business.sitemap_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {business.sitemap_url.split('/').pop()}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(business.status)}
                      {business.error_message && (
                        <div className="text-xs text-red-500 mt-1 truncate" title={business.error_message}>
                          {business.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {business.email ? (
                        <a 
                          href={`mailto:${business.email}`}
                          className="text-blue-600 hover:underline"
                          title={business.email}
                        >
                          {business.email}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={business.title || ''}>
                      {business.title || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={business.description || ''}>
                      {business.description ? business.description.substring(0, 50) + (business.description.length > 50 ? '...' : '') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate">
                      {business.address ? (
                        <span title={business.address}>{business.address.substring(0, 40) + (business.address.length > 40 ? '...' : '')}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {business.created_at ? (
                        <DateFormatter dateString={business.created_at} />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => setSelectedBusiness(business)}
                        className="p-1 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded"
                        title="Ver detalles completos"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {!loading && !error && businesses.length > 0 && (
        <div className="border-t border-gray-200 p-4">
          <Pagination 
            currentPage={currentPage} 
            totalPages={Math.ceil(totalRecords / 100)}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo(0, 0); // Volver arriba
            }}
          />
          <div className="text-xs text-center text-gray-500 mt-2">
            Mostrando {(currentPage - 1) * 100 + 1} a {Math.min(currentPage * 100, totalRecords)} de {totalRecords} resultados
          </div>
        </div>
      )}
      
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Última actualización: <DateFormatter dateString={new Date().toISOString()} format="dd MMM yyyy HH:mm:ss" /></p>
      </div>
    </div>
  );
}

function Pagination({ 
  currentPage, 
  totalPages,
  onPageChange
}: { 
  currentPage: number; 
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // Si hay menos de 2 páginas, no mostrar paginación
  if (totalPages <= 1) return null;
  
  // Determinar qué páginas mostrar
  let pages = [];
  const maxVisiblePages = 5;
  
  if (totalPages <= maxVisiblePages) {
    // Si hay pocas páginas, mostrar todas
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    // Siempre mostrar la primera página
    pages.push(1);
    
    // Calcular el rango de páginas a mostrar alrededor de la página actual
    let startPage = Math.max(2, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 3);
    
    // Ajustar si estamos cerca del inicio
    if (startPage === 2) {
      endPage = Math.min(totalPages - 1, maxVisiblePages - 1);
    }
    
    // Ajustar si estamos cerca del final
    if (endPage === totalPages - 1) {
      startPage = Math.max(2, totalPages - (maxVisiblePages - 1));
    }
    
    // Mostrar puntos suspensivos si hay espacio entre la primera página y el rango
    if (startPage > 2) {
      pages.push(-1); // Usar -1 para representar "..."
    }
    
    // Añadir el rango de páginas
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    // Mostrar puntos suspensivos si hay espacio entre el rango y la última página
    if (endPage < totalPages - 1) {
      pages.push(-2); // Usar -2 para representar "..." al final
    }
    
    // Siempre mostrar la última página
    pages.push(totalPages);
  }
  
  return (
    <div className="flex justify-center mt-4">
      <nav className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`px-3 py-1 rounded ${
            currentPage === 1 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-blue-600 hover:bg-blue-100'
          }`}
        >
          &lt;
        </button>
        
        {pages.map((page, index) => (
          page < 0 ? (
            <span key={`dots-${index}`} className="px-3 py-1 text-gray-500">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-3 py-1 rounded ${
                currentPage === page
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-600 hover:bg-blue-100'
              }`}
            >
              {page}
            </button>
          )
        ))}
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`px-3 py-1 rounded ${
            currentPage === totalPages
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-100'
          }`}
        >
          &gt;
        </button>
      </nav>
    </div>
  );
} 
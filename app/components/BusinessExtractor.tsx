"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { DateFormatter } from "./DateFormatter";

interface Business {
  id: string;
  url: string;
  title?: string;
  email?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  error_message?: string;
}

interface Statistics {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  error: number;
}

function StatBox({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className={`${color} rounded-lg p-3 text-center shadow`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium">{title}</div>
    </div>
  );
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

export default function BusinessExtractor() {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [statistics, setStatistics] = useState<Statistics>({ total: 0, pending: 0, processing: 0, completed: 0, error: 0 });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionId, setExtractionId] = useState('');
  const [extractionError, setExtractionError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const intervalRef = useRef<number | null>(null);
  
  // Estado para controlar si el polling está activo
  const [pollingActive, setPollingActive] = useState(true);
  
  const isProcessing = statistics.pending > 0 || statistics.processing > 0;
  
  // Función para registrar mensajes en el log
  const addLog = (message: string) => {
    setLogs(prev => [message, ...prev].slice(0, 200));
  };
  
  // Cargar estadísticas y negocios al iniciar
  useEffect(() => {
    fetchStatistics();
    fetchBusinesses();
    
    // Iniciar el polling cuando se monta el componente
    if (intervalRef.current === null && pollingActive) {
      intervalRef.current = window.setInterval(() => {
        setRefreshCount(prev => prev + 1);
        fetchStatistics();
        fetchBusinesses();
      }, 1000);
    }
    
    // Limpiar el intervalo cuando se desmonta
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pollingActive]);
  
  // Controlar el polling
  const togglePolling = () => {
    setPollingActive(prev => !prev);
    if (pollingActive && intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      addLog("Actualización automática desactivada");
    } else if (!pollingActive && intervalRef.current === null) {
      intervalRef.current = window.setInterval(() => {
        setRefreshCount(prev => prev + 1);
        fetchStatistics();
        fetchBusinesses();
      }, 1000);
      addLog("Actualización automática activada");
    }
  };
  
  const stopExtraction = async () => {
    try {
      if (!confirm('¿Está seguro que desea detener el proceso de extracción? Esto marcará todas las URLs pendientes como error.')) {
        return;
      }
      
      addLog("Deteniendo proceso de extracción...");
      
      // Desactivar completamente la actualización automática durante la detención
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setPollingActive(false);
      setIsExtracting(false);
      addLog("Actualización automática desactivada durante la detención");
      
      // Enviar solicitud para detener el proceso
      const response = await fetch('/api/extract/stop', {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al detener el proceso');
      }
      
      const data = await response.json();
      addLog(`Detención completa: ${data.message || 'Proceso detenido'}`);
      
      // Refrescar información sin resetear datos
      await fetchStatistics();
      await fetchBusinesses();
      
      // Reiniciar polling con intervalo más largo para conservar recursos
      if (!pollingActive) {
        setPollingActive(true);
        intervalRef.current = window.setInterval(() => {
          setRefreshCount(prev => prev + 1);
          fetchStatistics();
          fetchBusinesses();
        }, 5000); // 5 segundos
        addLog("Actualización automática reanudada con intervalo reducido");
      }
    } catch (error) {
      console.error('Error al detener la extracción:', error);
      addLog(`Error al detener extracción: ${error}`);
    }
  };
  
  const fetchStatistics = async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/extract?_t=${timestamp}`);
      if (!response.ok) throw new Error('Error fetching statistics');
      
      const data = await response.json();
      setStatistics(data.stats || { total: 0, pending: 0, processing: 0, completed: 0, error: 0 });
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };
  
  const fetchBusinesses = async () => {
    try {
      // Añadir un timestamp aleatorio para evitar el caché
      const timestamp = new Date().getTime() + Math.random();
      const response = await fetch(`/api/businesses?limit=1000&_t=${timestamp}`, {
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
      
      // Registrar nuevas URLs encontradas
      if (businesses.length < validBusinesses.length) {
        const newUrls = validBusinesses.filter((newBusiness: any) => 
          !businesses.some(existingBusiness => existingBusiness.url === newBusiness.url)
        );
        
        newUrls.forEach((business: any) => {
          addLog(`Nueva URL: ${business.url} (${business.status})`);
        });
      }
      
      // Ordenar por más recientes primero
      const sortedBusinesses = [...validBusinesses].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
      
      setBusinesses(sortedBusinesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
    }
  };
  
  const startExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sitemapUrl) {
      setExtractionError('Introduce una URL de sitemap válida');
      return;
    }
    
    setIsExtracting(true);
    setExtractionError('');
    
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar extracción');
      }
      
      setExtractionId(data.taskId);
      addLog(`Extracción iniciada con ID: ${data.taskId} para ${sitemapUrl}`);
      
      // Asegurar que el polling está activo después de iniciar la extracción
      if (!pollingActive) {
        setPollingActive(true);
        if (intervalRef.current === null) {
          intervalRef.current = window.setInterval(() => {
            setRefreshCount(prev => prev + 1);
            fetchStatistics();
            fetchBusinesses();
          }, 1000);
        }
      }
      
      // Refrescar inmediatamente
      await fetchStatistics();
      await fetchBusinesses();
      
    } catch (error) {
      console.error('Error starting extraction:', error);
      setExtractionError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setIsExtracting(false);
    }
  };
  
  const resetDatabase = async () => {
    if (!confirm('¿Estás seguro que deseas eliminar TODAS las URLs de la base de datos? Esta acción no se puede deshacer.')) {
      return;
    }
    
    try {
      addLog("Solicitando borrado de la base de datos...");
      const response = await fetch('/api/reset', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Error al resetear la base de datos');
      }
      
      addLog("¡Base de datos reiniciada correctamente!");
      
      // Detener el polling si está activo
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Limpiar estados
      setBusinesses([]);
      setStatistics({ total: 0, pending: 0, processing: 0, completed: 0, error: 0 });
      setExtractionId('');
      
      // Reiniciar el polling pero con un intervalo menor
      setPollingActive(true);
      intervalRef.current = window.setInterval(() => {
        setRefreshCount(prev => prev + 1);
        fetchStatistics();
        fetchBusinesses();
      }, 1000);
      
      // Refrescar inmediatamente
      await fetchStatistics();
      await fetchBusinesses();
      
    } catch (error) {
      console.error('Error resetting database:', error);
      addLog(`Error al resetear la base de datos: ${error}`);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-bold">Extractor de URLs y Emails</h1>
        <div className="flex space-x-2">
          <button
            onClick={togglePolling}
            className={`px-4 py-2 rounded-md text-sm font-medium ${pollingActive ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'}`}
          >
            {pollingActive ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </button>
          <button
            onClick={resetDatabase}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Resetear Base de Datos
          </button>
        </div>
      </div>
      
      {/* Diseño de dos columnas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Columna izquierda - Control y estadísticas */}
        <div className="space-y-4">
          {/* Banner de procesamiento */}
          {isProcessing && (
            <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-4 rounded-md shadow">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="font-bold">Procesando URLs: {statistics.pending + statistics.processing} pendientes</p>
                </div>
                <button 
                  onClick={stopExtraction}
                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-1 px-3 rounded flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Detener Proceso
                </button>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${Math.round((statistics.completed / (statistics.total || 1)) * 100)}%` }}></div>
              </div>
              <p className="text-xs mt-1">Progreso: {Math.round((statistics.completed / (statistics.total || 1)) * 100)}% completado</p>
            </div>
          )}
          
          {/* Formulario de extracción */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Iniciar Nueva Extracción</h2>
            <form onSubmit={startExtraction} className="space-y-4">
              <div>
                <label htmlFor="sitemapUrl" className="block text-sm font-medium text-gray-700">URL del Sitemap</label>
                <input
                  id="sitemapUrl"
                  type="text"
                  value={sitemapUrl}
                  onChange={(e) => setSitemapUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  disabled={isProcessing}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Introduce la URL de un sitemap XML para extraer solo las URLs raíz de cada dominio
                </p>
              </div>
              
              <button
                type="submit"
                disabled={isExtracting || isProcessing || !sitemapUrl}
                className={`w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                  ${(isExtracting || isProcessing || !sitemapUrl) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} 
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {isExtracting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Extrayendo...
                  </>
                ) : isProcessing ? 'Hay un proceso en ejecución' : !sitemapUrl ? 'Ingrese una URL' : 'Iniciar Extracción'}
              </button>
            </form>
            
            {extractionError && (
              <div className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                <p className="font-bold">Error</p>
                <p>{extractionError}</p>
              </div>
            )}
            
            {extractionId && (
              <div className="mt-4 bg-green-100 border-l-4 border-green-500 text-green-700 p-4" role="alert">
                <p className="font-bold">Extracción iniciada</p>
                <p>ID: {extractionId}</p>
              </div>
            )}
          </div>
          
          {/* Estadísticas */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Estadísticas</h2>
            <div className="grid grid-cols-5 gap-4">
              <StatBox title="Total" value={statistics.total} color="bg-gray-200" />
              <StatBox title="Pendientes" value={statistics.pending} color="bg-yellow-200" />
              <StatBox title="Procesando" value={statistics.processing} color="bg-blue-200" />
              <StatBox title="Completadas" value={statistics.completed} color="bg-green-200" />
              <StatBox title="Errores" value={statistics.error} color="bg-red-200" />
            </div>
            <div className="mt-4 text-xs text-gray-500 flex justify-between items-center">
              <span>
                {isProcessing ? '🟢 Proceso activo' : '⚪ Sin proceso activo'}
              </span>
              <span>Actualización #{refreshCount}</span>
            </div>
          </div>
        </div>
        
        {/* Columna derecha - Log y resultados */}
        <div className="space-y-4">
          {/* Log de eventos */}
          <div className="bg-black rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold text-white">Log de Eventos ({logs.length})</h2>
              <button 
                onClick={() => setLogs([])} 
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
              >
                Limpiar
              </button>
            </div>
            <div className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded h-60 overflow-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500">Esperando eventos...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">[{new Date().toLocaleTimeString()}] {log}</div>
                ))
              )}
            </div>
          </div>
          
          {/* Filtros de búsqueda */}
          <div className="bg-white shadow-md rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700">Filtrar por estado</label>
                <select 
                  id="status-filter" 
                  className="mt-1 block w-full p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pendientes</option>
                  <option value="processing">Procesando</option>
                  <option value="completed">Completados</option>
                  <option value="error">Errores</option>
                </select>
              </div>
              <div>
                <label htmlFor="url-search" className="block text-sm font-medium text-gray-700">Buscar URL</label>
                <input
                  id="url-search"
                  type="text"
                  placeholder="Filtrar por texto"
                  className="mt-1 block w-full p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>
            </div>
          </div>
          
          {/* Tabla de URLs */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">URLs Raíz Extraídas</h2>
              <span className="text-sm text-gray-500">
                {businesses.length} dominios encontrados
              </span>
            </div>
            
            {businesses.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                No se han encontrado URLs raíz. Inicia una extracción para ver resultados.
              </div>
            ) : (
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                    <tr>
                      <th scope="col" className="px-4 py-3">URL</th>
                      <th scope="col" className="px-4 py-3">Estado</th>
                      <th scope="col" className="px-4 py-3">Email</th>
                      <th scope="col" className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businesses.map((business) => (
                      <tr 
                        key={business.id} 
                        className={`border-b hover:bg-gray-50 ${
                          business.status === 'pending' ? 'bg-yellow-50' : 
                          business.status === 'processing' ? 'bg-blue-50' :
                          business.status === 'completed' ? 'bg-green-50' : 
                          business.status === 'error' ? 'bg-red-50' : 'bg-white'
                        }`}
                      >
                        <td className="px-4 py-2 truncate max-w-xs">
                          <a 
                            href={business.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium truncate block"
                            title={business.url}
                          >
                            {business.url}
                          </a>
                          {business.title && <span className="text-xs text-gray-500 block truncate">{business.title}</span>}
                        </td>
                        <td className="px-4 py-2">
                          {getStatusBadge(business.status)}
                        </td>
                        <td className="px-4 py-2 truncate" title={business.email || ''}>
                          {business.email ? (
                            <a 
                              href={`mailto:${business.email}`}
                              className="text-blue-600 hover:underline"
                            >
                              {business.email}
                            </a>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => {
                              const data = {
                                url: business.url,
                                status: business.status,
                                email: business.email,
                                title: business.title,
                                created_at: business.created_at,
                                processed_at: business.processed_at,
                                error_message: business.error_message
                              };
                              alert(JSON.stringify(data, null, 2));
                            }}
                            className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded"
                            title="Ver detalles"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            <div className="mt-4 text-center">
              <a 
                href="/dashboard" 
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                Ver panel de control completo con todas las URLs
              </a>
            </div>
          </div>
        </div>
      </div>
      
      {/* Modal para visualizar los resultados completos */}
      {/* Implementar en el futuro */}
    </div>
  );
} 
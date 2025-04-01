import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Obtener parámetros de consulta
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');
    const sitemap = searchParams.get('sitemap');
    const search = searchParams.get('search');
    
    // Validar parámetros
    const validatedLimit = Math.min(Math.max(1, limit), 1000); // Entre 1 y 1000
    const validatedOffset = Math.max(0, offset);
    
    const db = await getDb();
    try {
      // Construir la consulta dinámica
      let query = 'SELECT * FROM businesses';
      let countQuery = 'SELECT COUNT(*) as total FROM businesses';
      
      // Arreglo para los valores de parámetros
      const queryParams = [];
      const whereConditions = [];
      
      // Filtrar por estado
      if (status) {
        whereConditions.push('status = ?');
        queryParams.push(status);
      }
      
      // Filtrar por sitemap
      if (sitemap) {
        whereConditions.push('sitemap_url = ?');
        queryParams.push(sitemap);
      }
      
      // Filtrar por búsqueda
      if (search) {
        whereConditions.push('(url LIKE ? OR title LIKE ? OR email LIKE ?)');
        const searchPattern = `%${search}%`;
        queryParams.push(searchPattern, searchPattern, searchPattern);
      }
      
      // Añadir condiciones WHERE si existen
      if (whereConditions.length > 0) {
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        query += ` ${whereClause}`;
        countQuery += ` ${whereClause}`;
      }
      
      // Añadir ordenamiento y límites
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      queryParams.push(validatedLimit, validatedOffset);
      
      // Ejecutar consulta para obtener total
      const countResult = await db.get(countQuery, ...queryParams.slice(0, queryParams.length - 2));
      const total = countResult ? countResult.total : 0;
      
      // Ejecutar consulta principal
      const businesses = await db.all(query, ...queryParams);
      
      // Obtener estadísticas generales
      const statsQuery = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as withEmail
        FROM businesses
      `;
      
      const statsResult = await db.get(statsQuery);
      
      // Añadir registro
      console.log(`API /businesses: Obteniendo ${validatedLimit} URLs, offset ${validatedOffset}, status ${status || 'cualquiera'}`);
      console.log(`API /businesses: Se encontraron ${businesses.length} URLs de un total de ${total}`);
      
      if (businesses.length > 0) {
        console.log(`API /businesses: Ejemplos de URLs: ${businesses.slice(0, 5).map((b: any) => b.url).join(', ')}`);
      }
      
      return NextResponse.json({
        businesses,
        total,
        limit: validatedLimit,
        offset: validatedOffset,
        stats: statsResult || {
          total: 0,
          completed: 0,
          pending: 0,
          processing: 0,
          error: 0,
          withEmail: 0
        }
      });
    } finally {
      if (db) {
        await db.close();
      }
    }
  } catch (error) {
    console.error('Error obteniendo negocios:', error);
    return NextResponse.json(
      { error: 'Error al obtener negocios', details: String(error) },
      { status: 500 }
    );
  }
} 
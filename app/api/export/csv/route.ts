import { NextRequest, NextResponse } from 'next/server';
import { getBusinessesForExport } from '@/app/lib/db';

// Helper function to escape CSV fields
function escapeCsvField(field: any): string {
  if (field === null || field === undefined) {
    return '';
  }
  const stringField = String(field);
  // Escape double quotes by doubling them and enclose in double quotes if it contains comma, double quote, or newline
  if (stringField.includes(',') || stringField.includes('\"') || stringField.includes('\n')) {
    return `\"${stringField.replace(/\"/g, '\"\"')}\"`;
  }
  return stringField;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sitemapUrl = searchParams.get('sitemap') || undefined; // Get optional sitemap filter

    console.log(`API Export: Request received for sitemap: ${sitemapUrl || 'All'}`);

    // Fetch businesses using the new function
    const businesses = await getBusinessesForExport({ sitemap_url: sitemapUrl });

    if (!businesses || businesses.length === 0) {
        console.log('API Export: No businesses found for the given filter.');
        return NextResponse.json({ message: 'No data found for the specified sitemap.' }, { status: 404 });
    }

    console.log(`API Export: Found ${businesses.length} businesses to export.`);

    // Define CSV headers based on the selected columns in getBusinessesForExport
    const headers = [
      'url',
      'sitemap_url',
      'status',
      'email',
      'title',
      'description',
      'address',
      'created_at',
      'processed_at'
    ];

    // Convert data to CSV string
    let csvContent = headers.map(escapeCsvField).join(',') + '\n'; // Header row

    businesses.forEach(business => {
      const row = headers.map(header => escapeCsvField(business[header]));
      csvContent += row.join(',') + '\n';
    });

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sitemapName = sitemapUrl ? sitemapUrl.split('/').pop()?.replace(/\.xml$/i, '') || 'sitemap' : 'all';
    const filename = `export_${sitemapName}_${timestamp}.csv`;

    // Return CSV response
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('API Export: Error generating CSV export:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSV export', details: String(error) },
      { status: 500 }
    );
  }
} 
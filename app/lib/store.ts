import { create } from 'zustand';

export interface Business {
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

interface BusinessStore {
  businesses: Business[];
  setBusinesses: (businesses: Business[]) => void;
  refreshBusinesses: () => Promise<void>;
}

export const businessStore = create<BusinessStore>((set) => ({
  businesses: [],
  
  setBusinesses: (businesses) => set({ businesses }),
  
  refreshBusinesses: async () => {
    try {
      const response = await fetch('/api/businesses?limit=50');
      if (!response.ok) throw new Error('Error fetching businesses');
      const data = await response.json();
      set({ businesses: data.businesses });
      console.log('Businesses refreshed:', data.businesses.length);
    } catch (error) {
      console.error('Error refreshing businesses:', error);
    }
  }
})); 
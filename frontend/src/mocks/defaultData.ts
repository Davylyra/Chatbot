import type { DynamicData, DataCollection } from '../services/dataService';

export function getDefaultData(type: string, id: string): DynamicData | null {
  const defaultData: Record<string, Record<string, any>> = {
    user: {
      '1': {
        id: '1',
        name: 'User',
        email: 'user@example.com',
        phone: '+233123456789',
        createdAt: '2025-01-15T10:00:00Z',
        location: 'Accra, Ghana',
        bio: 'Passionate about technology and education',
        interests: ['Computer Science', 'Engineering', 'Technology'],
        preferredUniversities: ['KNUST', 'UG', 'Ashesi'],
      },
    },
    university: {
      '1': {
        id: '1',
        name: 'KNUST',
        fullName: 'Kwame Nkrumah University of Science & Technology',
        location: 'Kumasi, Ashanti Region',
        established: 1952,
        studentCount: '50,000+',
        type: 'public',
        programs: ['Engineering', 'Medicine', 'Agriculture', 'Business', 'Science'],
        logo: '/university-logos/knust-logo.png',
        formPrice: '₵290',
        buyPrice: '₵290',
        deadline: '2026-12-31',
        isAvailable: true,
        description: "Ghana's premier science and technology university",
      },
    },
  };

  const data = defaultData[type]?.[id];
  if (!data) return null;

  return {
    id,
    type: type as any,
    data,
    lastUpdated: new Date().toISOString(),
  };
}

export function getDefaultDataCollection(type: string): DataCollection {
  const defaultCollections: Record<string, DataCollection> = {
    users: {
      type: 'users',
      items: [
        {
          id: '1',
          type: 'user',
          data: {
            id: '1',
            name: 'User',
            email: 'user@example.com',
            phone: '+233123456789',
            createdAt: '2025-01-15T10:00:00Z',
            location: 'Accra, Ghana',
            bio: 'Passionate about technology and education',
            interests: ['Computer Science', 'Engineering', 'Technology'],
            preferredUniversities: ['KNUST', 'UG', 'Ashesi'],
          },
          lastUpdated: new Date().toISOString(),
        },
      ],
      total: 1,
      lastUpdated: new Date().toISOString(),
    },
    universities: {
      type: 'universities',
      items: [
        {
          id: '1',
          type: 'university',
          data: {
            id: '1',
            name: 'KNUST',
            fullName: 'Kwame Nkrumah University of Science & Technology',
            location: 'Kumasi, Ashanti Region',
            established: 1952,
            studentCount: '50,000+',
            type: 'public',
            programs: ['Engineering', 'Medicine', 'Agriculture', 'Business', 'Science'],
            logo: '/university-logos/knust-logo.png',
            formPrice: '₵290',
            buyPrice: '₵290',
            deadline: '2026-12-31',
            isAvailable: true,
            description: "Ghana's premier science and technology university",
          },
          lastUpdated: new Date().toISOString(),
        },
      ],
      total: 1,
      lastUpdated: new Date().toISOString(),
    },
  };

  return (
    defaultCollections[type] || {
      type,
      items: [],
      total: 0,
      lastUpdated: new Date().toISOString(),
    }
  );
}

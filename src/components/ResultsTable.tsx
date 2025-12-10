import { ExternalLink, Star, Phone, MapPin, MessageCircle, Instagram } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Business } from '@/types/business';

interface ResultsTableProps {
  results: Business[];
}

export function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {results.map((business, index) => (
        <Card key={`${business.place_id}-${index}`} className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base line-clamp-2">{business.name}</CardTitle>
              {business.rating && (
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">{business.rating}</span>
                  {business.reviews && (
                    <span className="text-xs text-muted-foreground">({business.reviews})</span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{business.address}</span>
            </div>
            
            <Badge variant="secondary" className="w-fit text-xs">
              {business.city}, {business.state}
            </Badge>

            <div className="flex flex-wrap gap-2 mt-auto pt-2">
              {business.whatsapp && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                  asChild
                >
                  <a href={business.whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                </Button>
              )}
              
              {business.instagram && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-pink-600 border-pink-200 hover:bg-pink-50 hover:text-pink-700"
                  asChild
                >
                  <a href={business.instagram} target="_blank" rel="noopener noreferrer">
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </a>
                </Button>
              )}
              
              {business.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  asChild
                >
                  <a href={`tel:${business.phone}`}>
                    <Phone className="h-4 w-4" />
                    Ligar
                  </a>
                </Button>
              )}
              
              {business.website && 
               business.website.trim() !== '' && 
               business.website.startsWith('http') &&
               !business.website.includes('wa.me') && 
               !business.website.includes('instagram.com') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  asChild
                >
                  <a href={business.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Site
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

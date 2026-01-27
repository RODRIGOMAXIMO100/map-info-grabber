import { useMemo } from 'react';
import { MessageCircle, Mail, Phone, Instagram, Facebook, Linkedin, Award, Clock, Database, Globe, Smartphone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Business } from '@/types/business';
import { validateBrazilianPhone } from '@/lib/phoneValidation';
import { ApiUsageStats } from '@/hooks/useBusinessSearch';

interface SearchStatsProps {
  results: Business[];
  apiUsage: ApiUsageStats;
  searchDuration?: number;
}

export function SearchStats({ results, apiUsage, searchDuration }: SearchStatsProps) {
  const stats = useMemo(() => {
    const total = results.length;
    
    // Count each channel
    const withWhatsApp = results.filter(r => r.whatsapp).length;
    const withEmail = results.filter(r => r.email).length;
    const withInstagram = results.filter(r => r.instagram).length;
    const withFacebook = results.filter(r => r.facebook).length;
    const withLinkedIn = results.filter(r => r.linkedin).length;
    
    // Phone validation stats
    const phoneStats = results.reduce((acc, r) => {
      if (r.phone) {
        const validation = validateBrazilianPhone(r.phone);
        if (validation.isValid) {
          acc.valid++;
          if (validation.isMobile) acc.mobile++;
          else acc.landline++;
        } else {
          acc.invalid++;
        }
      }
      return acc;
    }, { valid: 0, invalid: 0, mobile: 0, landline: 0 });
    
    // Quality distribution
    const highQuality = results.filter(r => (r.score || 0) >= 3).length;
    const mediumQuality = results.filter(r => {
      const score = r.score || 0;
      return score >= 1.5 && score < 3;
    }).length;
    const lowQuality = total - highQuality - mediumQuality;

    // City distribution
    const cityDistribution: Record<string, number> = {};
    results.forEach(r => {
      const key = `${r.city}, ${r.state}`;
      cityDistribution[key] = (cityDistribution[key] || 0) + 1;
    });
    const topCities = Object.entries(cityDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total,
      withWhatsApp,
      withEmail,
      withInstagram,
      withFacebook,
      withLinkedIn,
      phoneStats,
      highQuality,
      mediumQuality,
      lowQuality,
      topCities,
    };
  }, [results]);

  if (results.length === 0) {
    return null;
  }

  const percentage = (value: number) => 
    stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;

  return (
    <Card className="bg-gradient-to-br from-muted/30 to-muted/10 border-muted">
      <CardContent className="pt-4 space-y-4">
        {/* Main metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<MessageCircle className="h-4 w-4 text-green-600" />}
            label="WhatsApp"
            value={stats.withWhatsApp}
            total={stats.total}
          />
          <StatCard
            icon={<Mail className="h-4 w-4 text-orange-600" />}
            label="Email"
            value={stats.withEmail}
            total={stats.total}
          />
          <StatCard
            icon={<Smartphone className="h-4 w-4 text-blue-600" />}
            label="Celular"
            value={stats.phoneStats.mobile}
            total={stats.total}
          />
          <StatCard
            icon={<Award className="h-4 w-4 text-yellow-600" />}
            label="Alta Qualidade"
            value={stats.highQuality}
            total={stats.total}
          />
        </div>

        {/* Quality distribution bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Distribuição de Qualidade</span>
            <span>{stats.total} leads</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            <div 
              className="bg-green-500 transition-all" 
              style={{ width: `${percentage(stats.highQuality)}%` }}
              title={`Alta: ${stats.highQuality}`}
            />
            <div 
              className="bg-yellow-500 transition-all" 
              style={{ width: `${percentage(stats.mediumQuality)}%` }}
              title={`Média: ${stats.mediumQuality}`}
            />
            <div 
              className="bg-gray-400 transition-all" 
              style={{ width: `${percentage(stats.lowQuality)}%` }}
              title={`Baixa: ${stats.lowQuality}`}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Alta ({percentage(stats.highQuality)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              Média ({percentage(stats.mediumQuality)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Baixa ({percentage(stats.lowQuality)}%)
            </span>
          </div>
        </div>

        {/* Social media stats */}
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Instagram className="h-3.5 w-3.5 text-pink-500" />
            {stats.withInstagram}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Facebook className="h-3.5 w-3.5 text-blue-600" />
            {stats.withFacebook}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Linkedin className="h-3.5 w-3.5 text-sky-600" />
            {stats.withLinkedIn}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5 text-gray-500" />
            Fixos: {stats.phoneStats.landline}
          </span>
        </div>

        {/* API Usage & Time */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/50 text-xs text-muted-foreground">
          {searchDuration !== undefined && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {searchDuration < 60 ? `${searchDuration}s` : `${Math.floor(searchDuration / 60)}m ${searchDuration % 60}s`}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-blue-500" />
            API: {apiUsage.serper}
          </span>
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-purple-500" />
            Cache: {apiUsage.cache}
          </span>
        </div>

        {/* Top cities */}
        {stats.topCities.length > 1 && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-2">Top cidades</p>
            <div className="flex flex-wrap gap-1.5">
              {stats.topCities.map(([city, count]) => (
                <span 
                  key={city} 
                  className="text-xs bg-muted rounded-full px-2 py-0.5"
                >
                  {city} ({count})
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
}

function StatCard({ icon, label, value, total }: StatCardProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  
  return (
    <div className="bg-background/60 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-lg font-semibold">{value}</span>
      </div>
      <div className="space-y-1">
        <Progress value={percentage} className="h-1" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

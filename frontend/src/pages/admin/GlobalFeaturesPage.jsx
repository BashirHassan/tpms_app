/**
 * Global Features Page
 * 
 * Platform-wide feature management for super_admin only.
 * Shows all features with institution usage counts.
 * Accessible from admin.digitaltipi.com subdomain.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  IconToggleLeft, 
  IconToggleRight,
  IconSearch, 
  IconRefresh,
  IconBuilding,
  IconCheck,
  IconX,
  IconChartBar,
  IconFilter,
} from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import api from '../../api/client';

const getModuleColor = (module) => {
  const colors = {
    students: 'bg-blue-100 text-blue-700',
    payments: 'bg-green-100 text-green-700',
    postings: 'bg-purple-100 text-purple-700',
    monitoring: 'bg-orange-100 text-orange-700',
    results: 'bg-yellow-100 text-yellow-700',
    documents: 'bg-pink-100 text-pink-700',
    general: 'bg-gray-100 text-gray-700',
    other: 'bg-gray-100 text-gray-700',
  };
  return colors[module] || 'bg-gray-100 text-gray-700';
};

function GlobalFeaturesPage() {
  const [features, setFeatures] = useState([]);
  const [stats, setStats] = useState({ total_features: 0, total_institutions: 0, by_module: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [featureDetail, setFeatureDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedModule) params.set('module', selectedModule);

      const response = await api.get(`/global/features?${params}`);
      const data = response.data.data;
      
      setFeatures(data.features);
      setStats(data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load features');
    } finally {
      setLoading(false);
    }
  }, [selectedModule]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const fetchFeatureDetail = async (featureId) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/global/features/${featureId}`);
      setFeatureDetail(response.data.data);
      setSelectedFeature(featureId);
    } catch (err) {
      console.error('Failed to load feature detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedFeature(null);
    setFeatureDetail(null);
  };

  // Group features by module
  const groupedFeatures = features.reduce((acc, feature) => {
    const mod = feature.module || 'other';
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(feature);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Global Features</h1>
          <p className="text-gray-500 text-sm mt-1">
            View all platform features and their usage across institutions
          </p>
        </div>
        <Button onClick={fetchFeatures} variant="outline" size="sm">
          <IconRefresh className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <IconToggleLeft className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total_features}</p>
                <p className="text-xs text-gray-500">Total Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <IconBuilding className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total_institutions}</p>
                <p className="text-xs text-gray-500">Active Institutions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <IconChartBar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.by_module?.length || 0}</p>
                <p className="text-xs text-gray-500">Feature Modules</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <IconToggleRight className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {features.filter(f => f.is_premium).length}
                </p>
                <p className="text-xs text-gray-500">Premium Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selectedModule === '' ? 'primary' : 'outline'}
              onClick={() => setSelectedModule('')}
            >
              All Modules
            </Button>
            {stats.by_module?.map((mod) => (
              <Button
                key={mod.module}
                size="sm"
                variant={selectedModule === mod.module ? 'primary' : 'outline'}
                onClick={() => setSelectedModule(mod.module)}
              >
                {mod.module} ({mod.feature_count})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Features Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500">{error}</p>
          <Button onClick={fetchFeatures} variant="outline" className="mt-4">
            Try Again
          </Button>
        </div>
      ) : (
        <div className="grid gap-6">
          {Object.entries(groupedFeatures).map(([module, moduleFeatures]) => (
            <Card key={module}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getModuleColor(module)}`}>
                    {module}
                  </span>
                  <span className="text-gray-400 font-normal text-sm">
                    ({moduleFeatures.length} features)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {moduleFeatures.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                      onClick={() => fetchFeatureDetail(feature.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{feature.name}</h3>
                          {feature.is_premium && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                              Premium
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{feature.description || feature.feature_key}</p>
                        <p className="text-xs text-gray-400 mt-1 font-mono">{feature.feature_key}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                        {/* Usage Bar */}
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 rounded-full" 
                                style={{ width: `${feature.usage_percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-700 w-12 text-right">
                              {feature.usage_percentage}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {feature.enabled_count} / {feature.total_institutions} institutions
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Feature Detail Modal */}
      {selectedFeature && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50" onClick={closeDetail} />
            
            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : featureDetail ? (
                <>
                  <div className="p-6 border-b">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{featureDetail.feature.name}</h2>
                        <p className="text-sm text-gray-500 mt-1">{featureDetail.feature.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getModuleColor(featureDetail.feature.module)}`}>
                            {featureDetail.feature.module}
                          </span>
                          {featureDetail.feature.is_premium && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                              Premium
                            </span>
                          )}
                          <span className="text-xs text-gray-400 font-mono">{featureDetail.feature.feature_key}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={closeDetail}>
                        <IconX className="w-5 h-5" />
                      </Button>
                    </div>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">{featureDetail.stats.enabled_count}</p>
                        <p className="text-xs text-green-700">Enabled</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-600">{featureDetail.stats.disabled_count}</p>
                        <p className="text-xs text-gray-700">Disabled</p>
                      </div>
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">{featureDetail.stats.usage_percentage}%</p>
                        <p className="text-xs text-blue-700">Adoption</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Institutions List */}
                  <div className="p-6 max-h-96 overflow-y-auto">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Institution Usage</h3>
                    <div className="space-y-2">
                      {featureDetail.institutions.map((inst) => (
                        <div
                          key={inst.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              inst.is_enabled ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                              {inst.is_enabled ? (
                                <IconCheck className="w-4 h-4 text-green-600" />
                              ) : (
                                <IconX className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{inst.name}</p>
                              <p className="text-xs text-gray-500">{inst.code} • {inst.subdomain}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            inst.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {inst.is_enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  Failed to load feature details
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalFeaturesPage;

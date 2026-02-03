/**
 * Ranks Management Page
 * Manage staff ranks and allowance components
 */

import { useState, useEffect } from 'react';
import { ranksApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconAward,
  IconPlus,
  IconPencil,
  IconTrash,
  IconCalculator,
  IconBadge,
  IconCurrencyNaira,
  IconMapPin,
  IconSettings,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';

function RanksPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(true);
  const [ranks, setRanks] = useState([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editRank, setEditRank] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    local_running_allowance: 0,
    transport_per_km: 0,
    dsa: 0,
    dta: 0,
    tetfund: 0,
    other_allowances: {},
  });
  const [saving, setSaving] = useState(false);

  // Allowance calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcRank, setCalcRank] = useState(null);
  const [calcDistance, setCalcDistance] = useState(0);
  const [calcDays, setCalcDays] = useState(1);
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Session settings for dynamic calculation
  const [sessionSettings, setSessionSettings] = useState({
    inside_distance_threshold_km: 10,
    dsa_enabled: false,
    dsa_min_distance_km: 11,
    dsa_max_distance_km: 30,
    dsa_percentage: 50,
  });
  const [sessionLoading, setSessionLoading] = useState(false);

  // Other allowances input state
  const [newAllowanceKey, setNewAllowanceKey] = useState('');
  const [newAllowanceValue, setNewAllowanceValue] = useState('');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rankToDelete, setRankToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch ranks
  const fetchRanks = async () => {
    setLoading(true);
    try {
      const response = await ranksApi.getAll();
      setRanks(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load ranks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRanks();
    fetchSessionSettings();
  }, []);

  // Fetch current session settings for allowance calculation
  const fetchSessionSettings = async () => {
    setSessionLoading(true);
    try {
      const response = await sessionsApi.getCurrent();
      const session = response.data.data || response.data || null;
      if (session) {
        setSessionSettings({
          inside_distance_threshold_km: parseFloat(session.inside_distance_threshold_km) || 10,
          dsa_enabled: session.dsa_enabled || false,
          dsa_min_distance_km: parseFloat(session.dsa_min_distance_km) || 11,
          dsa_max_distance_km: parseFloat(session.dsa_max_distance_km) || 30,
          dsa_percentage: parseFloat(session.dsa_percentage) || 50,
        });
      }
    } catch (err) {
      // Use defaults if no session found
      console.warn('No current session found, using default settings');
    } finally {
      setSessionLoading(false);
    }
  };

  // Modal handlers
  const openCreateModal = () => {
    setEditRank(null);
    setFormData({
      name: '',
      code: '',
      local_running_allowance: 0,
      transport_per_km: 0,
      dsa: 0,
      dta: 0,
      tetfund: 0,
      other_allowances: {},
    });
    setShowModal(true);
  };

  const openEditModal = (rank) => {
    setEditRank(rank);
    setFormData({
      name: rank.name,
      code: rank.code,
      local_running_allowance: rank.local_running_allowance || 0,
      transport_per_km: rank.transport_per_km || 0,
      dsa: rank.dsa || 0,
      dta: rank.dta || 0,
      tetfund: rank.tetfund || 0,
      other_allowances: rank.other_allowances || {},
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      toast.error('Name and code are required');
      return;
    }

    setSaving(true);
    try {
      if (editRank) {
        await ranksApi.update(editRank.id, formData);
        toast.success('Rank updated successfully');
      } else {
        await ranksApi.create(formData);
        toast.success('Rank created successfully');
      }

      setShowModal(false);
      fetchRanks();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save rank');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setRankToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!rankToDelete) return;
    
    setDeleting(true);
    try {
      await ranksApi.delete(rankToDelete);
      toast.success('Rank deleted successfully');
      fetchRanks();
      setShowDeleteConfirm(false);
      setRankToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete rank');
    } finally {
      setDeleting(false);
    }
  };

  // Allowance calculator
  const openCalculator = (rank) => {
    setCalcRank(rank);
    setCalcDistance(0);
    setCalcDays(1);
    setCalcResult(null);
    setShowCalculator(true);
  };

  /**
   * Calculate allowance using the system's dynamic formula
   * 
   * INSIDE (distance ≤ inside_distance_threshold_km):
   *   - LOCAL RUNNING ONLY
   *   - No transport, no DSA, no DTA, no TETFUND
   * 
   * OUTSIDE (distance > inside_distance_threshold_km):
   *   - NO local running
   *   - Transport (rate × distance)
   *   - TETFUND
   *   - DSA or DTA (mutually exclusive):
   *     - If DSA enabled AND distance within DSA range → DSA (% of DTA)
   *     - Otherwise → full DTA
   */
  const calculateAllowance = () => {
    if (!calcRank) return;
    
    setCalculating(true);

    const distance = parseFloat(calcDistance) || 0;
    const days = parseInt(calcDays) || 1;
    
    // Get session thresholds
    const insideThreshold = sessionSettings.inside_distance_threshold_km;
    const dsaEnabled = sessionSettings.dsa_enabled;
    const dsaMinDistance = sessionSettings.dsa_min_distance_km;
    const dsaMaxDistance = sessionSettings.dsa_max_distance_km;
    const dsaPercentage = sessionSettings.dsa_percentage;

    // Determine location category
    const isInside = distance <= insideThreshold;
    const locationCategory = isInside ? 'INSIDE' : 'OUTSIDE';

    // Get rank allowances
    const localRunningRate = parseFloat(calcRank.local_running_allowance) || 0;
    const transportPerKm = parseFloat(calcRank.transport_per_km) || 0;
    const dtaRate = parseFloat(calcRank.dta) || 0;
    const tetfundRate = parseFloat(calcRank.tetfund) || 0;

    // Initialize breakdown
    let localRunningAmount = 0;
    let transportAmount = 0;
    let dsaAmount = 0;
    let dtaAmount = 0;
    let tetfundAmount = 0;
    let otherAmount = 0;

    if (isInside) {
      // INSIDE: Local running ONLY
      localRunningAmount = localRunningRate;
    } else {
      // OUTSIDE: Transport + (DSA or DTA) + TETFUND - NO local running
      
      // Transport based on distance
      transportAmount = transportPerKm * distance;
      
      // TETFUND for outside postings
      tetfundAmount = tetfundRate;
      
      // DSA vs DTA logic
      if (dsaEnabled && distance >= dsaMinDistance && distance <= dsaMaxDistance) {
        // DSA applies - calculate as percentage of DTA
        dsaAmount = (dtaRate * dsaPercentage) / 100;
      } else {
        // DTA applies (either DSA disabled or distance outside DSA range)
        dtaAmount = dtaRate;
      }
    }

    // Calculate other allowances
    if (calcRank.other_allowances) {
      const others =
        typeof calcRank.other_allowances === 'string'
          ? JSON.parse(calcRank.other_allowances)
          : calcRank.other_allowances;

      if (Array.isArray(others)) {
        otherAmount = others.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      }
    }

    // Per-visit subtotal
    const perVisitTotal = localRunningAmount + transportAmount + dsaAmount + dtaAmount + tetfundAmount + otherAmount;
    
    // Total for all visits/days
    const grandTotal = perVisitTotal * days;

    // Build result
    setCalcResult({
      location_category: locationCategory,
      is_inside: isInside,
      distance_km: distance,
      days: days,
      threshold_used: insideThreshold,
      dsa_enabled: dsaEnabled,
      dsa_range: dsaEnabled ? `${dsaMinDistance}km - ${dsaMaxDistance}km` : null,
      dsa_percentage: dsaEnabled ? dsaPercentage : null,
      // Breakdown (per visit)
      breakdown: {
        local_running: localRunningAmount,
        transport: transportAmount,
        transport_rate: transportPerKm,
        dsa: dsaAmount,
        dta: dtaAmount,
        tetfund: tetfundAmount,
        other: otherAmount,
      },
      per_visit_total: perVisitTotal,
      total: grandTotal,
      // Explanation text
      explanation: isInside 
        ? `INSIDE posting (${distance}km ≤ ${insideThreshold}km threshold). Only Local Running allowance applies.`
        : dsaEnabled && distance >= dsaMinDistance && distance <= dsaMaxDistance
          ? `OUTSIDE posting in DSA range (${dsaMinDistance}-${dsaMaxDistance}km). DSA at ${dsaPercentage}% of DTA.`
          : `OUTSIDE posting. Full DTA applies${dsaEnabled ? ` (distance outside DSA range)` : ''}.`,
    });

    setCalculating(false);
  };

  // Other allowances management
  const addOtherAllowance = () => {
    if (!newAllowanceKey || !newAllowanceValue) return;
    setFormData({
      ...formData,
      other_allowances: {
        ...formData.other_allowances,
        [newAllowanceKey]: parseFloat(newAllowanceValue),
      },
    });
    setNewAllowanceKey('');
    setNewAllowanceValue('');
  };

  const removeOtherAllowance = (key) => {
    const updated = { ...formData.other_allowances };
    delete updated[key];
    setFormData({ ...formData, other_allowances: updated });
  };



  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Staff Ranks</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage ranks and allowance components</p>
        </div>
        {canEdit && (
          <Button onClick={openCreateModal} size="sm" className="active:scale-95 flex-shrink-0">
            <IconPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Rank</span>
          </Button>
        )}
      </div>

      {/* Ranks Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
          {ranks.map((rank) => (
            <Card key={rank.id} className="relative">
              <CardHeader className="pb-2 p-3 sm:p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <IconAward className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">{rank.name}</CardTitle>
                      <IconBadge variant="outline" className="mt-1 text-xs">{rank.code}</IconBadge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 sm:pt-0">
                <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4">
                  <div className="text-xs sm:text-sm text-gray-500">Allowance Components:</div>
                  <div className="grid grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Local Running:</span>
                      <span className="font-medium">{formatCurrency(rank.local_running_allowance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transport/km:</span>
                      <span className="font-medium">{formatCurrency(rank.transport_per_km)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">DSA:</span>
                      <span className="font-medium">{formatCurrency(rank.dsa)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">DTA:</span>
                      <span className="font-medium">{formatCurrency(rank.dta)}</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-gray-500">TETFund:</span>
                      <span className="font-medium">{formatCurrency(rank.tetfund)}</span>
                    </div>
                  </div>

                  {rank.other_allowances && Object.keys(rank.other_allowances).length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-gray-400 mb-1">Other Allowances:</div>
                      {Object.entries(rank.other_allowances).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-500 capitalize">{key}:</span>
                          <span className="font-medium">{formatCurrency(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openCalculator(rank)}
                  >
                    <IconCalculator className="w-4 h-4 mr-1" />
                    Calculate
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(rank)}
                      >
                        <IconPencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(rank.id)}
                      >
                        <IconTrash className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {ranks.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              <IconAward className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No ranks configured yet</p>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editRank ? 'Edit Rank' : 'Create Rank'}
        width="2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editRank ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Professor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., PROF"
              />
            </div>
          </div>

          {/* Allowance Components */}
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-3">Allowance Components (₦)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Local Running</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.local_running_allowance}
                  onChange={(e) => setFormData({ ...formData, local_running_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Transport per km</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.transport_per_km}
                  onChange={(e) => setFormData({ ...formData, transport_per_km: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">DSA (Daily Subsistence)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.dsa}
                  onChange={(e) => setFormData({ ...formData, dsa: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">DTA (Duty Tour)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.dta}
                  onChange={(e) => setFormData({ ...formData, dta: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">TETFund</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.tetfund}
                  onChange={(e) => setFormData({ ...formData, tetfund: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          {/* Other Allowances */}
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-3">Other Allowances</h3>
            {Object.entries(formData.other_allowances).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 mb-2">
                <span className="flex-1 capitalize">{key}</span>
                <span className="font-medium">{formatCurrency(value)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOtherAllowance(key)}
                  className="text-red-500 hover:text-red-700"
                >
                  <IconX className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="Name"
                value={newAllowanceKey}
                onChange={(e) => setNewAllowanceKey(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Amount"
                value={newAllowanceValue}
                onChange={(e) => setNewAllowanceValue(e.target.value)}
                className="w-32"
              />
              <Button variant="outline" size="sm" onClick={addOtherAllowance}>
                <IconPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Allowance Calculator Modal */}
      <Dialog
        isOpen={showCalculator && !!calcRank}
        onClose={() => setShowCalculator(false)}
        title={
          <span className="flex items-center gap-2">
            <IconCalculator className="w-5 h-5 text-primary-600" />
            Allowance Calculator
          </span>
        }
        width="2xl"
        footer={
          <Button variant="outline" onClick={() => setShowCalculator(false)}>
            Close
          </Button>
        }
      >
        {calcRank && (
          <div className="space-y-4">
            {/* Selected Rank */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <IconAward className="w-5 h-5 text-primary-600" />
                <span className="font-medium">{calcRank.name}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                <span>Local: {formatCurrency(calcRank.local_running_allowance)}</span>
                <span>Transport: {formatCurrency(calcRank.transport_per_km)}/km</span>
                <span>DTA: {formatCurrency(calcRank.dta)}</span>
              </div>
            </div>

            {/* Session Settings Info */}
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-800 font-medium text-sm mb-2">
                <IconSettings className="w-4 h-4" />
                Current Session Settings
              </div>
              {sessionLoading ? (
                <div className="text-sm text-blue-600">Loading session settings...</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  <div className="flex items-center gap-1">
                    <IconMapPin className="w-3 h-3" />
                    <span>Inside Threshold: {sessionSettings.inside_distance_threshold_km}km</span>
                  </div>
                  <div>
                    DSA: {sessionSettings.dsa_enabled ? (
                      <span className="text-green-600">Enabled ({sessionSettings.dsa_percentage}%)</span>
                    ) : (
                      <span className="text-gray-500">Disabled</span>
                    )}
                  </div>
                  {sessionSettings.dsa_enabled && (
                    <div className="col-span-2">
                      DSA Range: {sessionSettings.dsa_min_distance_km}km - {sessionSettings.dsa_max_distance_km}km
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Distance (km)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={calcDistance}
                  onChange={(e) => {
                    setCalcDistance(e.target.value);
                    setCalcResult(null);
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Visits
                </label>
                <Input
                  type="number"
                  min="1"
                  value={calcDays}
                  onChange={(e) => {
                    setCalcDays(e.target.value);
                    setCalcResult(null);
                  }}
                  placeholder="1"
                />
              </div>
            </div>

            <Button className="w-full" onClick={calculateAllowance} disabled={calculating}>
              <IconCalculator className="w-4 h-4 mr-2" />
              {calculating ? 'Calculating...' : 'Calculate Allowance'}
            </Button>

            {/* Calculation Result */}
            {calcResult && (
              <div className={`rounded-lg p-4 space-y-3 ${
                calcResult.is_inside ? 'bg-amber-50' : 'bg-green-50'
              }`}>
                {/* Location Category Badge */}
                <div className="flex items-center justify-between">
                  <h4 className={`font-medium flex items-center gap-2 ${
                    calcResult.is_inside ? 'text-amber-900' : 'text-green-900'
                  }`}>
                    <IconCurrencyNaira className="w-5 h-5" />
                    Calculation Result
                  </h4>
                  <Badge variant={calcResult.is_inside ? 'warning' : 'success'}>
                    {calcResult.location_category}
                  </Badge>
                </div>

                {/* Explanation */}
                <div className={`text-xs p-2 rounded ${
                  calcResult.is_inside ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                }`}>
                  <IconInfoCircle className="w-3 h-3 inline mr-1" />
                  {calcResult.explanation}
                </div>

                {/* Per-Visit Breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="text-xs text-gray-500 uppercase font-medium">Per Visit Breakdown:</div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">Local Running:</span>
                    <span className={`font-medium ${calcResult.breakdown.local_running > 0 ? '' : 'text-gray-400'}`}>
                      {formatCurrency(calcResult.breakdown.local_running)}
                      {calcResult.is_inside && <span className="text-xs ml-1">(applies)</span>}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Transport ({calcResult.distance_km}km × {formatCurrency(calcResult.breakdown.transport_rate)}):
                    </span>
                    <span className={`font-medium ${calcResult.breakdown.transport > 0 ? '' : 'text-gray-400'}`}>
                      {formatCurrency(calcResult.breakdown.transport)}
                    </span>
                  </div>
                  
                  {calcResult.dsa_enabled && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        DSA ({calcResult.dsa_percentage}% of DTA):
                      </span>
                      <span className={`font-medium ${calcResult.breakdown.dsa > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {formatCurrency(calcResult.breakdown.dsa)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">DTA:</span>
                    <span className={`font-medium ${calcResult.breakdown.dta > 0 ? '' : 'text-gray-400'}`}>
                      {formatCurrency(calcResult.breakdown.dta)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600">TETFund:</span>
                    <span className={`font-medium ${calcResult.breakdown.tetfund > 0 ? '' : 'text-gray-400'}`}>
                      {formatCurrency(calcResult.breakdown.tetfund)}
                    </span>
                  </div>
                  
                  {calcResult.breakdown.other > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Other Allowances:</span>
                      <span className="font-medium">{formatCurrency(calcResult.breakdown.other)}</span>
                    </div>
                  )}

                  {/* Per-Visit Subtotal */}
                  <div className={`flex justify-between pt-2 border-t ${
                    calcResult.is_inside ? 'border-amber-200' : 'border-green-200'
                  }`}>
                    <span className="font-medium text-gray-700">Per Visit:</span>
                    <span className="font-semibold">
                      {formatCurrency(calcResult.per_visit_total)}
                    </span>
                  </div>

                  {/* Grand Total (if multiple visits) */}
                  {calcResult.days > 1 && (
                    <div className={`flex justify-between py-2 border-t ${
                      calcResult.is_inside ? 'border-amber-200 text-amber-900' : 'border-green-200 text-green-900'
                    }`}>
                      <span className="font-semibold">
                        Total ({calcResult.days} visits):
                      </span>
                      <span className="font-bold text-lg">
                        {formatCurrency(calcResult.total)}
                      </span>
                    </div>
                  )}

                  {calcResult.days === 1 && (
                    <div className={`flex justify-between py-2 border-t ${
                      calcResult.is_inside ? 'border-amber-200 text-amber-900' : 'border-green-200 text-green-900'
                    }`}>
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(calcResult.total)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setRankToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Rank"
        message="Are you sure you want to delete this rank? This action cannot be undone and may affect allowance calculations."
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default RanksPage;

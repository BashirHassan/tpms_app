import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../api/portal';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton, SkeletonPageHeader } from '../../components/ui/Skeleton';
import {
  IconAlertCircle,
  IconSchool,
  IconCheck,
  IconClock,
  IconInfoCircle,
  IconUser,
} from '@tabler/icons-react';

const NIGERIAN_PHONE = /^(\+?234|0)[789]\d{9}$/;

function GateCard({ icon: Icon, color, title, children }) {
  const colorMap = {
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200',
  };
  const iconMap = {
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };
  return (
    <Card className={colorMap[color]}>
      <CardContent className="p-6 sm:p-10 text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${iconMap[color]}`} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

const EMPTY_FORM = { proposed_principal_name: '', proposed_principal_phone: '' };

export default function PrincipalUpdatePage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const res = await portalApi.getMySchoolPrincipal();
      setData(res.data.data);
    } catch {
      toast.error('Failed to load school data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const validate = () => {
    const errs = {};
    if (!form.proposed_principal_name || form.proposed_principal_name.trim().length < 3) {
      errs.proposed_principal_name = 'Principal name must be at least 3 characters';
    }
    if (!form.proposed_principal_phone || !NIGERIAN_PHONE.test(form.proposed_principal_phone)) {
      errs.proposed_principal_phone = 'Enter a valid Nigerian phone number (e.g. 08012345678)';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      await portalApi.submitPrincipalUpdate({
        proposed_principal_name: form.proposed_principal_name,
        proposed_principal_phone: form.proposed_principal_phone,
      });
      setSuccess(true);
      setForm(EMPTY_FORM);
      await fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-1 space-y-6">
        <SkeletonPageHeader withAction={false} />
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="p-6 pb-4"><Skeleton className="h-5 w-40" /></div>
          <div className="px-4 pb-4 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="p-6 pb-4"><Skeleton className="h-5 w-56" /></div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="p-6 pb-4"><Skeleton className="h-5 w-40" /></div>
          <div className="px-4 pb-6 space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data?.active_session) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <GateCard icon={IconClock} color="blue" title="No Active Session">
          <p className="text-gray-600 text-sm">There is no active teaching practice session at this time.</p>
        </GateCard>
      </div>
    );
  }

  if (!data?.acceptance?.approved) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <GateCard icon={IconAlertCircle} color="amber" title="Acceptance Required">
          <p className="text-gray-600 text-sm mb-4">
            Your acceptance form must be approved before you can submit a school update.
          </p>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => navigate('/student/acceptance')}>
              Go to Acceptance
            </Button>
          </div>
        </GateCard>
      </div>
    );
  }

  if (!data?.feature_enabled) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <GateCard icon={IconAlertCircle} color="amber" title="Feature Disabled">
          <p className="text-gray-600 text-sm">
            Principal update submissions are not enabled for this institution.
          </p>
        </GateCard>
      </div>
    );
  }

  const { acceptance, principal } = data;

  return (
    <div className="max-w-2xl mx-auto px-1 pb-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Update Principal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Submit a correction if your school&apos;s principal has changed.
        </p>
      </div>

      {/* School info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconSchool className="w-5 h-5 text-primary-600" />
            Your School
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1 text-sm text-gray-700">
          <p className="font-semibold text-gray-900">{acceptance.school_name}</p>
          {acceptance.school_code && (
            <p className="text-gray-500 text-xs font-mono">{acceptance.school_code}</p>
          )}
          <p>
            {acceptance.school_lga}, {acceptance.school_state}
            {acceptance.school_ward ? ` - ${acceptance.school_ward}` : ''}
          </p>
          {acceptance.school_address && (
            <p className="text-gray-500">{acceptance.school_address}</p>
          )}
        </CardContent>
      </Card>

      {/* Current Principal */}
      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconUser className="w-5 h-5 text-gray-500" />
            Current Principal on Record
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Name</p>
              <p className="font-medium text-gray-900">{principal.current_name || <span className="text-gray-400 italic">Not recorded</span>}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phone</p>
              <p className="font-medium text-gray-900">{principal.current_phone || <span className="text-gray-400 italic">Not recorded</span>}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status banners */}
      {success && (
        <Card className="border border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center gap-3 text-green-800">
            <IconCheck className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">
              Request submitted successfully. The TP unit will review and apply the update.
            </p>
          </CardContent>
        </Card>
      )}

      {data.pending_request_exists && !success && (
        <Card className="border border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3 text-blue-800">
            <IconInfoCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">
              A pending update request already exists for your school. It is currently under review.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Update form */}
      {data.can_submit && !success && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconUser className="w-5 h-5 text-primary-600" />
              Propose New Principal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 !pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Principal Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  className={errors.proposed_principal_name ? 'border-red-400' : ''}
                  placeholder="Enter full name"
                  value={form.proposed_principal_name}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, proposed_principal_name: e.target.value }));
                    setErrors((err) => ({ ...err, proposed_principal_name: undefined }));
                  }}
                  disabled={submitting}
                />
                {errors.proposed_principal_name && (
                  <p className="text-xs text-red-600 mt-1">{errors.proposed_principal_name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Principal Phone <span className="text-red-500">*</span>
                </label>
                <Input
                  type="tel"
                  className={errors.proposed_principal_phone ? 'border-red-400' : ''}
                  placeholder="e.g. 08012345678"
                  value={form.proposed_principal_phone}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, proposed_principal_phone: e.target.value }));
                    setErrors((err) => ({ ...err, proposed_principal_phone: undefined }));
                  }}
                  disabled={submitting}
                />
                {errors.proposed_principal_phone && (
                  <p className="text-xs text-red-600 mt-1">{errors.proposed_principal_phone}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={submitting}>
                  <IconUser className="w-4 h-4 mr-2" />
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

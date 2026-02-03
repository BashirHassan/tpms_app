/**
 * Edit Institution Settings Page
 * Super Admin - Edit any institution's settings by ID
 * Uses the same form components as CreateInstitutionPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/helpers';
import { institutionsApi } from '../../api/institutions';
import { paymentsApi, programsApi } from '../../api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  InstitutionInfoForm,
  BrandingForm,
  SmtpForm,
  PaymentForm,
  GeneralForm,
} from '../../components/forms/InstitutionFormSections';
import APIKeysForm from '../../components/forms/APIKeysForm';
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconBuilding,
  IconMail,
  IconCreditCard,
  IconSettings,
  IconRefresh,
  IconPalette,
  IconCheck,
  IconKey,
} from '@tabler/icons-react';

export default function EditInstitutionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('institution');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [smtpTestResultType, setSmtpTestResultType] = useState(null);
  const [testingPaystack, setTestingPaystack] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [institutionName, setInstitutionName] = useState('');
  
  // Per-tab saving states
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  
  // Per-tab dirty states (track if changes were made)
  const [dirtyTabs, setDirtyTabs] = useState({
    institution: false,
    branding: false,
    smtp: false,
    general: false,
    payment: false,
  });

  // Institution tab state
  const [institutionData, setInstitutionData] = useState({
    name: '',
    code: '',
    subdomain: '',
    institution_type: 'college_of_education',
    email: '',
    phone: '',
    address: '',
    state: '',
  });

  // Branding tab state
  const [brandingData, setBrandingData] = useState({
    logo_url: '',
    primary_color: '#1a5f2a',
    secondary_color: '#8b4513',
  });

  // SMTP tab state
  const [smtpData, setSmtpData] = useState({
    smtp_host: '',
    smtp_port: 465,
    smtp_secure: true,
    smtp_user: '',
    smtp_password: '',
    smtp_from_name: '',
    smtp_from_email: '',
  });

  // General tab state
  const [generalData, setGeneralData] = useState({
    maintenance_mode: false,
    maintenance_message: '',
    allow_student_portal: true,
    require_pin_change: true,
    session_timeout_minutes: 1440,
  });

  // Payment tab state
  const [paymentConfig, setPaymentConfig] = useState({
    payment_type: 'per_student',
    base_amount: 0,
    currency: 'NGN',
    allow_partial_payment: false,
    minimum_payment_percentage: 100,
    program_pricing: {},
    paystack_public_key: '',
    paystack_secret_key: '',
    paystack_split_code: '',
  });

  const tabs = [
    { id: 'institution', name: 'Institution', icon: IconBuilding },
    { id: 'branding', name: 'Branding', icon: IconPalette },
    { id: 'smtp', name: 'Email (SMTP)', icon: IconMail },
    { id: 'payment', name: 'Payment', icon: IconCreditCard },
    { id: 'general', name: 'General', icon: IconSettings },
    { id: 'apikeys', name: 'API Keys', icon: IconKey },
  ];

  const fetchSettings = useCallback(async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      
      // Fetch institution data
      const institutionRes = await institutionsApi.getById(id);
      const inst = institutionRes?.data?.data || institutionRes?.data;
      
      if (inst) {
        setInstitutionName(inst.name || '');
        
        setInstitutionData({
          name: inst.name || '',
          code: inst.code || '',
          subdomain: inst.subdomain || '',
          institution_type: inst.institution_type || 'college_of_education',
          email: inst.email || '',
          phone: inst.phone || '',
          address: inst.address || '',
          state: inst.state || '',
        });

        setBrandingData({
          logo_url: inst.logo_url || '',
          primary_color: inst.primary_color || '#1a5f2a',
          secondary_color: inst.secondary_color || '#8b4513',
        });

        setSmtpData({
          smtp_host: inst.smtp_host || '',
          smtp_port: inst.smtp_port || 465,
          smtp_secure: inst.smtp_secure !== false,
          smtp_user: inst.smtp_user || '',
          smtp_password: inst.smtp_password || '',
          smtp_from_name: inst.smtp_from_name || '',
          smtp_from_email: inst.smtp_from_email || '',
        });

        setGeneralData({
          maintenance_mode: inst.maintenance_mode || false,
          maintenance_message: inst.maintenance_message || '',
          allow_student_portal: inst.allow_student_portal !== false,
          require_pin_change: inst.require_pin_change !== false,
          session_timeout_minutes: inst.session_timeout_minutes || 1440,
        });

        // Payment configuration
        let programPricing = inst.payment_program_pricing || {};
        if (typeof programPricing === 'string') {
          try {
            programPricing = JSON.parse(programPricing);
          } catch {
            programPricing = {};
          }
        }
        setPaymentConfig({
          payment_type: inst.payment_type || 'per_student',
          base_amount: inst.payment_base_amount || 0,
          currency: inst.payment_currency || 'NGN',
          allow_partial_payment: inst.payment_allow_partial || false,
          minimum_payment_percentage: inst.payment_minimum_percentage || 100,
          program_pricing: programPricing,
          paystack_public_key: inst.paystack_public_key || '',
          paystack_secret_key: inst.paystack_secret_key || '',
          paystack_split_code: inst.paystack_split_code || '',
        });
      }
      
      // Reset dirty states
      setDirtyTabs({
        institution: false,
        branding: false,
        smtp: false,
        general: false,
        payment: false,
      });
    } catch (error) {
      console.error('Failed to fetch institution:', error);
      toast.error('Failed to load institution settings');
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Tab-specific change handlers
  const handleInstitutionChange = (name, value) => {
    setInstitutionData(prev => ({ ...prev, [name]: value }));
    setDirtyTabs(prev => ({ ...prev, institution: true }));
  };

  const handleBrandingChange = (name, value) => {
    setBrandingData(prev => ({ ...prev, [name]: value }));
    setDirtyTabs(prev => ({ ...prev, branding: true }));
  };

  const handleSmtpChange = (name, value) => {
    setSmtpData(prev => ({ ...prev, [name]: value }));
    setDirtyTabs(prev => ({ ...prev, smtp: true }));
  };

  const handleGeneralChange = (name, value) => {
    setGeneralData(prev => ({ ...prev, [name]: value }));
    setDirtyTabs(prev => ({ ...prev, general: true }));
  };

  const handlePaymentConfigChange = (name, value) => {
    setPaymentConfig(prev => ({ ...prev, [name]: value }));
    setDirtyTabs(prev => ({ ...prev, payment: true }));
  };

  const handleProgramPricingChange = (programId, value) => {
    setPaymentConfig(prev => ({
      ...prev,
      program_pricing: {
        ...prev.program_pricing,
        [programId]: parseFloat(value) || 0,
      },
    }));
    setDirtyTabs(prev => ({ ...prev, payment: true }));
  };

  // Tab-specific save handlers
  const handleSaveInstitution = async () => {
    try {
      setSavingInstitution(true);
      await institutionsApi.update(id, institutionData);
      toast.success('Institution information saved successfully');
      setDirtyTabs(prev => ({ ...prev, institution: false }));
      setInstitutionName(institutionData.name);
    } catch (error) {
      console.error('Failed to save institution:', error);
      toast.error(error.response?.data?.message || 'Failed to save institution information');
    } finally {
      setSavingInstitution(false);
    }
  };

  const handleSaveBranding = async () => {
    try {
      setSavingBranding(true);
      await institutionsApi.update(id, brandingData);
      toast.success('Branding settings saved successfully');
      setDirtyTabs(prev => ({ ...prev, branding: false }));
    } catch (error) {
      console.error('Failed to save branding:', error);
      toast.error(error.response?.data?.message || 'Failed to save branding settings');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSaveSmtp = async () => {
    try {
      setSavingSmtp(true);
      // Don't send masked password
      const payload = { ...smtpData };
      const isMasked = !payload.smtp_password || 
                       payload.smtp_password === '••••••••' || 
                       payload.smtp_password === '********' ||
                       (payload.smtp_password && payload.smtp_password.endsWith('••••••••'));
      if (isMasked) {
        delete payload.smtp_password;
      }
      await institutionsApi.update(id, payload);
      toast.success('SMTP settings saved successfully');
      setDirtyTabs(prev => ({ ...prev, smtp: false }));
    } catch (error) {
      console.error('Failed to save SMTP:', error);
      toast.error(error.response?.data?.message || 'Failed to save SMTP settings');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSaveGeneral = async () => {
    try {
      setSavingGeneral(true);
      await institutionsApi.update(id, generalData);
      toast.success('General settings saved successfully');
      setDirtyTabs(prev => ({ ...prev, general: false }));
    } catch (error) {
      console.error('Failed to save general:', error);
      toast.error(error.response?.data?.message || 'Failed to save general settings');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSavePaymentConfig = async () => {
    try {
      setSavingPayment(true);
      
      // Helper to check if a value is masked
      const isMasked = (val) => {
        if (!val || typeof val !== 'string') return true;
        return val === '••••••••' || val === '********' || val.endsWith('••••••••');
      };
      
      const payload = {
        payment_type: paymentConfig.payment_type,
        payment_base_amount: parseFloat(paymentConfig.base_amount) || 0,
        payment_currency: paymentConfig.currency,
        payment_allow_partial: Boolean(paymentConfig.allow_partial_payment),
        payment_minimum_percentage: parseFloat(paymentConfig.minimum_payment_percentage) || 100,
        payment_program_pricing: paymentConfig.program_pricing,
        paystack_split_code: paymentConfig.paystack_split_code,
      };
      
      // Only include Paystack keys if not masked
      if (!isMasked(paymentConfig.paystack_public_key)) {
        payload.paystack_public_key = paymentConfig.paystack_public_key;
      }
      if (!isMasked(paymentConfig.paystack_secret_key)) {
        payload.paystack_secret_key = paymentConfig.paystack_secret_key;
      }
      
      await institutionsApi.update(id, payload);
      toast.success('Payment configuration saved successfully');
      setDirtyTabs(prev => ({ ...prev, payment: false }));
    } catch (error) {
      console.error('Failed to save payment config:', error);
      toast.error(error.response?.data?.message || 'Failed to save payment configuration');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleTestSmtp = async (testEmail) => {
    if (!testEmail) {
      toast.error('Please enter an email address');
      return;
    }
    
    setTestingSmtp(true);
    setSmtpTestResult(null);
    setSmtpTestResultType(null);
    
    try {
      const response = await institutionsApi.testSmtp(id, testEmail);
      setSmtpTestResult(response.message || 'Test email sent successfully!');
      setSmtpTestResultType('success');
      toast.success('Test email sent successfully!');
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to send test email';
      setSmtpTestResult(errorMessage);
      setSmtpTestResultType('error');
      toast.error(errorMessage);
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestPaystack = async () => {
    toast.info('Paystack test not available for remote institutions');
  };


  // Access control
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <IconBuilding className="w-16 h-16 mx-auto text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">Only Super Admin can edit institution settings.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderInstitutionTab = () => (
    <div className="space-y-4">
      <InstitutionInfoForm
        data={institutionData}
        onChange={handleInstitutionChange}
        errors={{}}
        isEditing={true}
      />

      <div className="flex justify-end">
        <Button 
          onClick={handleSaveInstitution} 
          loading={savingInstitution}
          disabled={!dirtyTabs.institution}
        >
          <IconDeviceFloppy className="w-4 h-4 mr-2" />
          {savingInstitution ? 'Saving...' : 'Save Institution Info'}
          {!dirtyTabs.institution && <IconCheck className="w-4 h-4 ml-2 text-green-500" />}
        </Button>
      </div>
    </div>
  );

  const renderBrandingTab = () => (
    <div className="space-y-4">
      <BrandingForm
        data={brandingData}
        onChange={handleBrandingChange}
        errors={{}}
        institutionCode={institutionData.code}
      />

      <div className="flex justify-end">
        <Button 
          onClick={handleSaveBranding} 
          loading={savingBranding}
          disabled={!dirtyTabs.branding}
        >
          <IconDeviceFloppy className="w-4 h-4 mr-2" />
          {savingBranding ? 'Saving...' : 'Save Branding'}
          {!dirtyTabs.branding && <IconCheck className="w-4 h-4 ml-2 text-green-500" />}
        </Button>
      </div>
    </div>
  );

  const renderSmtpTab = () => (
    <div className="space-y-4">
      <SmtpForm
        data={smtpData}
        onChange={handleSmtpChange}
        onTest={handleTestSmtp}
        testing={testingSmtp}
        testResult={smtpTestResult}
        testResultType={smtpTestResultType}
      />

      <div className="flex justify-end">
        <Button 
          onClick={handleSaveSmtp} 
          loading={savingSmtp}
          disabled={!dirtyTabs.smtp}
        >
          <IconDeviceFloppy className="w-4 h-4 mr-2" />
          {savingSmtp ? 'Saving...' : 'Save SMTP Settings'}
          {!dirtyTabs.smtp && <IconCheck className="w-4 h-4 ml-2 text-green-500" />}
        </Button>
      </div>
    </div>
  );

  const renderPaymentTab = () => (
    <div className="space-y-4">
      <PaymentForm
        data={paymentConfig}
        onChange={handlePaymentConfigChange}
        onProgramPricingChange={handleProgramPricingChange}
        formatCurrency={formatCurrency}
        programs={programs}
        onTestPaystack={handleTestPaystack}
        testingPaystack={testingPaystack}
      />

      <div className="flex justify-end">
        <Button onClick={handleSavePaymentConfig} loading={savingPayment}>
          <IconDeviceFloppy className="w-4 h-4 mr-2" />
          {savingPayment ? 'Saving...' : 'Save Payment Settings'}
        </Button>
      </div>
    </div>
  );

  const renderGeneralTab = () => (
    <div className="space-y-4">
      <GeneralForm
        data={generalData}
        onChange={handleGeneralChange}
      />

      <div className="flex justify-end">
        <Button 
          onClick={handleSaveGeneral} 
          loading={savingGeneral}
          disabled={!dirtyTabs.general}
        >
          <IconDeviceFloppy className="w-4 h-4 mr-2" />
          {savingGeneral ? 'Saving...' : 'Save General Settings'}
          {!dirtyTabs.general && <IconCheck className="w-4 h-4 ml-2 text-green-500" />}
        </Button>
      </div>
    </div>
  );

  const renderApiKeysTab = () => (
    <APIKeysForm 
      institutionId={id} 
      onToast={(message, type) => toast({ title: message, variant: type })} 
    />
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'institution':
        return renderInstitutionTab();
      case 'branding':
        return renderBrandingTab();
      case 'smtp':
        return renderSmtpTab();
      case 'payment':
        return renderPaymentTab();
      case 'general':
        return renderGeneralTab();
      case 'apikeys':
        return renderApiKeysTab();
      default:
        return renderInstitutionTab();
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/institutions')}
            className="active:scale-95"
          >
            <IconArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Institution</h1>
            <p className="text-xs sm:text-sm text-gray-500 truncate">{institutionName || 'Loading...'}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" onClick={fetchSettings} loading={isLoading} size="sm" className="active:scale-95">
            <IconRefresh className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Reload</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 -mx-2 sm:mx-0 overflow-x-auto">
        <nav className="flex gap-1 sm:gap-2 -mb-px px-2 sm:px-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isDirty = dirtyTabs[tab.id];
            return (
              <Button
                key={tab.id}
                variant="ghost"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 rounded-none transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.name}</span>
                {isDirty && (
                  <span className="w-2 h-2 bg-orange-500 rounded-full" title="Unsaved changes" />
                )}
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {renderActiveTab()}
    </div>
  );
}

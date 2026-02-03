/**
 * DocumentTemplatesPage
 * Admin page for managing document templates
 * Provides template listing, creation, editing, and preview
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  IconFileText as FileText, 
  IconPlus as Plus, 
  IconSearch as Search, 
  IconEdit as Edit2, 
  IconTrash as Trash2, 
  IconCopy as Copy, 
  IconEye as Eye, 
  IconCheck as Check,
  IconClock as Clock,
  IconArchive as Archive,
  IconUpload as Upload,
  IconChevronDown as ChevronDown,
  IconRefresh as RotateCcw,
  IconHistory as History,
  IconX as X,
  IconDeviceFloppy as Save,
  IconAlertCircle as AlertCircle,
  IconArrowLeft,
  IconTemplate
} from '@tabler/icons-react';
import { formatDate } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { documentTemplatesApi } from '../../api/documentTemplates';import { ConfirmDialog } from '../../components/ui/ConfirmDialog';import PlaceholderPicker from '../../components/documents/PlaceholderPicker';
import TemplateEditor from '../../components/documents/TemplateEditor';
import TemplatePreview from '../../components/documents/TemplatePreview';

// Document type configurations
const DOCUMENT_TYPES = [
  { value: 'introduction_letter', label: 'Introduction Letter', description: 'Letter introducing student to schools' },
  { value: 'acceptance_form', label: 'Acceptance Form', description: 'Form for school to accept student' },
  { value: 'posting_letter', label: 'Posting Letter', description: 'Official posting assignment letter' },
  { value: 'supervisor_invitation_letter', label: 'Supervisor Invitation Letter', description: 'Letter to supervisors' },
  { value: 'completion_certificate', label: 'Completion Certificate', description: 'TP completion certificate' }
];

// Status badge component
const StatusBadge = ({ status }) => {
  const styles = {
    draft: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800'
  };

  const icons = {
    draft: Clock,
    published: Check,
    archived: Archive
  };

  const Icon = icons[status] || Clock;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.draft}`}>
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const DocumentTemplatesPage = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();

  // State
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('introduction_letter');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [editorContent, setEditorContent] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [initialEditorState, setInitialEditorState] = useState({ content: '', name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState('sample');
  
  // Version history
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null,
    data: null,
    loading: false
  });

  const insertPlaceholderRef = useRef(null);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await documentTemplatesApi.getAll({
        document_type: activeTab,
        search: searchTerm || undefined
      });
      setTemplates(response.data.data || response.data || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Handle placeholder insert from picker
  const handlePlaceholderInsert = (placeholderText, placeholder) => {
    if (insertPlaceholderRef.current) {
      insertPlaceholderRef.current(placeholderText);
    }
  };

  // Create new template
  const handleCreate = () => {
    const defaultName = `New ${DOCUMENT_TYPES.find(t => t.value === activeTab)?.label || 'Template'}`;
    setCurrentTemplate(null);
    setEditorContent('');
    setTemplateName(defaultName);
    setTemplateDescription('');
    setInitialEditorState({ content: '', name: defaultName, description: '' });
    setIsEditing(true);
    setShowPreview(false);
  };

  // Edit template
  const handleEdit = async (template) => {
    try {
      const response = await documentTemplatesApi.getById(template.id);
      const fullTemplate = response.data.data || response.data || {};
      
      setCurrentTemplate(fullTemplate);
      setEditorContent(fullTemplate.content || '');
      setTemplateName(fullTemplate.name);
      setTemplateDescription(fullTemplate.description || '');
      setInitialEditorState({
        content: fullTemplate.content || '',
        name: fullTemplate.name,
        description: fullTemplate.description || ''
      });
      setIsEditing(true);
      setShowPreview(false);
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Failed to load template');
    }
  };

  // Save template
  const handleSave = async (publish = false) => {
    try {
      setSaving(true);

      const data = {
        document_type: activeTab,
        name: templateName,
        description: templateDescription,
        content: editorContent
      };

      let savedTemplate;
      if (currentTemplate?.id) {
        const response = await documentTemplatesApi.update(currentTemplate.id, data);
        savedTemplate = response.data.data || response.data || {};
      } else {
        const response = await documentTemplatesApi.create(data);
        savedTemplate = response.data.data || response.data || {};
      }

      if (publish && savedTemplate.status === 'draft') {
        await documentTemplatesApi.publish(savedTemplate.id);
      }

      setIsEditing(false);
      setCurrentTemplate(null);
      fetchTemplates();
    } catch (err) {
      console.error('Save error:', err);
      setError(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // Publish template
  const handlePublish = async (template) => {
    try {
      await documentTemplatesApi.publish(template.id);
      fetchTemplates();
    } catch (err) {
      console.error('Publish error:', err);
      setError(err.response?.data?.message || 'Failed to publish template');
    }
  };

  // Archive template
  const handleArchive = (template) => {
    setConfirmDialog({
      isOpen: true,
      type: 'archive',
      data: template,
      loading: false
    });
  };

  // Delete template
  const handleDelete = (template) => {
    setConfirmDialog({
      isOpen: true,
      type: 'delete',
      data: template,
      loading: false
    });
  };

  // Duplicate template
  const handleDuplicate = async (template) => {
    try {
      await documentTemplatesApi.duplicate(template.id);
      fetchTemplates();
    } catch (err) {
      console.error('Duplicate error:', err);
      setError(err.response?.data?.message || 'Failed to duplicate template');
    }
  };

  // Show version history
  const handleShowVersions = async (template) => {
    try {
      setLoadingVersions(true);
      setShowVersions(true);
      setCurrentTemplate(template);
      
      const response = await documentTemplatesApi.getVersions(template.id);
      setVersions(response.data.data || response.data || []);
    } catch (err) {
      console.error('Failed to load versions:', err);
      setError('Failed to load version history');
    } finally {
      setLoadingVersions(false);
    }
  };

  // Rollback to version
  const handleRollback = (version) => {
    setConfirmDialog({
      isOpen: true,
      type: 'rollback',
      data: version,
      loading: false
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    const hasChanges = 
      editorContent !== initialEditorState.content ||
      templateName !== initialEditorState.name ||
      templateDescription !== initialEditorState.description;
    
    if (hasChanges) {
      setConfirmDialog({
        isOpen: true,
        type: 'discard',
        data: null,
        loading: false
      });
      return;
    }
    setIsEditing(false);
    setCurrentTemplate(null);
    setEditorContent('');
  };

  // Handle confirmation dialog actions
  const handleConfirmAction = async () => {
    const { type, data } = confirmDialog;
    setConfirmDialog(prev => ({ ...prev, loading: true }));

    try {
      switch (type) {
        case 'archive':
          await documentTemplatesApi.archive(data.id);
          fetchTemplates();
          break;
        case 'delete':
          await documentTemplatesApi.delete(data.id);
          fetchTemplates();
          break;
        case 'rollback':
          await documentTemplatesApi.rollback(currentTemplate.id, data);
          setShowVersions(false);
          fetchTemplates();
          break;
        case 'discard':
          setIsEditing(false);
          setCurrentTemplate(null);
          setEditorContent('');
          break;
      }
      setConfirmDialog({ isOpen: false, type: null, data: null, loading: false });
    } catch (err) {
      console.error(`${type} error:`, err);
      setError(err.response?.data?.message || `Failed to ${type}`);
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Get confirm dialog config based on type
  const getConfirmDialogConfig = () => {
    const { type, data } = confirmDialog;
    switch (type) {
      case 'archive':
        return {
          title: 'Archive Template',
          message: `Are you sure you want to archive "${data?.name}"? This template will no longer be available for use.`,
          confirmText: 'Archive',
          variant: 'warning'
        };
      case 'delete':
        return {
          title: 'Delete Template',
          message: `Are you sure you want to delete "${data?.name}"? This action cannot be undone.`,
          confirmText: 'Delete',
          variant: 'danger'
        };
      case 'rollback':
        return {
          title: 'Rollback Version',
          message: `Rollback to version ${data}? The current content will be saved as a new version.`,
          confirmText: 'Rollback',
          variant: 'warning'
        };
      case 'discard':
        return {
          title: 'Unsaved Changes',
          message: 'You have unsaved changes. Please save your work or confirm to discard.',
          confirmText: 'Discard Changes',
          variant: 'warning'
        };
      default:
        return {
          title: 'Confirm',
          message: 'Are you sure?',
          confirmText: 'Confirm',
          variant: 'warning'
        };
    }
  };

  // Filter templates by search
  const filteredTemplates = templates.filter(t => 
    !searchTerm || 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Render editor view
  if (isEditing) {
    return (
      <div className="h-full flex flex-col bg-gray-100">
        {/* Editor Header */}
        <div className="bg-white border-b border-grcay-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancelEdit}
                className="p-2 hover:bg-gray-100 rounded-md"
              >
                <X className="h-5 w-5" />
              </Button>
              <div>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="text-lg font-semibold bg-transparent border-none focus:ring-0 p-0"
                  placeholder="Template Name"
                />
                <input
                  type="text"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 w-full"
                  placeholder="Add description..."
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors
                  ${showPreview ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
              
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 
                         rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
              
              <Button
                variant="default"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white 
                         rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Save & Publish
              </Button>
            </div>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Editor - hidden when preview is active */}
          {!showPreview && (
            <div className="flex-1 p-6 overflow-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <TemplateEditor
                  value={editorContent}
                  onChange={setEditorContent}
                  onInsertPlaceholder={insertPlaceholderRef}
                  placeholder="Start designing your document template..."
                />
              </div>
            </div>
          )}

          {/* Preview Panel - full width when active */}
          {showPreview && (
            <div className="flex-1 p-6 overflow-auto">
              <div className="mb-4 flex items-center gap-2">
                <select
                  value={previewMode}
                  onChange={(e) => setPreviewMode(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1.5"
                >
                  <option value="raw">Raw Template</option>
                  <option value="sample">Sample Data</option>
                </select>
              </div>
              
              {currentTemplate?.id ? (
                <TemplatePreview
                  templateId={currentTemplate.id}
                  documentType={activeTab}
                  mode={previewMode}
                />
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>Save the template to preview</p>
                </div>
              )}
            </div>
          )}

          {/* Placeholder Sidebar - only show when editing */}
          {!showPreview && (
            <PlaceholderPicker
              documentType={activeTab}
              onInsert={handlePlaceholderInsert}
              className="w-80 flex-shrink-0"
            />
          )}
        </div>
      </div>
    );
  }

  // Access check - only super admin can manage templates
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <IconTemplate className="w-16 h-16 mx-auto text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">Only Super Admin can manage document templates.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            <IconArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Render list view
  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 flex-1">{error}</span>
          <Button variant="ghost" size="icon" onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Document Templates</h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Design and manage document templates
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="flex items-center justify-center gap-2 px-3 py-2 sm:px-4 bg-green-600 text-white 
                   rounded-lg hover:bg-green-700 transition-colors text-sm active:scale-95 flex-shrink-0"
        >
          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">New Template</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Document Type Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 sm:mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {DOCUMENT_TYPES.map((type) => (
              <Button
                key={type.value}
                variant="ghost"
                onClick={() => setActiveTab(type.value)}
                className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors rounded-none
                  ${activeTab === type.value
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {type.label}
              </Button>
            ))}
          </nav>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg 
                       focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* Template List */}
        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No templates found</p>
              <Button
                variant="link"
                onClick={handleCreate}
                className="mt-4 text-green-600 hover:text-green-700 font-medium"
              >
                Create your first template
              </Button>
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{template.name}</h3>
                        <StatusBadge status={template.status} />
                        {template.is_default && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {template.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>Version {template.version}</span>
                        <span>Updated {formatDate(template.updated_at)}</span>
                        {template.created_by_name && (
                          <span>By {template.created_by_name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(template)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDuplicate(template)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleShowVersions(template)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                      title="Version History"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    
                    {template.status === 'draft' && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handlePublish(template)}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          Publish
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(template)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    
                    {template.status === 'published' && !template.is_default && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleArchive(template)}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Version History Modal */}
      {showVersions && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">Version History</h2>
                <p className="text-sm text-gray-500">{currentTemplate?.name}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowVersions(false)}
                className="p-2 hover:bg-gray-100 rounded-md"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {loadingVersions ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : versions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No versions found</p>
              ) : (
                <div className="space-y-4">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-gray-300"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Version {version.version}</span>
                            {version.version === currentTemplate?.version && (
                              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {version.change_summary || 'No change summary'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(version.created_at).toLocaleString()} by {version.created_by_name}
                          </p>
                        </div>
                        {version.version !== currentTemplate?.version && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRollback(version.version)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 
                                     rounded-md hover:bg-gray-50"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, data: null, loading: false })}
        onConfirm={handleConfirmAction}
        loading={confirmDialog.loading}
        {...getConfirmDialogConfig()}
      />
    </div>
  );
};

export default DocumentTemplatesPage;

/**
 * PlaceholderPicker Component
 * Sidebar panel showing available placeholders grouped by category
 * Allows drag-and-drop or click-to-insert into editor
 */

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  IconUser as User, 
  IconBuilding as Building2, 
  IconCalendar as Calendar, 
  IconSchool as GraduationCap, 
  IconBuildingCommunity as School, 
  IconClock as Clock,
  IconSearch as Search,
  IconCopy as Copy,
  IconChevronDown as ChevronDown,
  IconChevronRight as ChevronRight,
  IconInfoCircle as Info
} from '@tabler/icons-react';
import { Button } from '../ui';
import { documentTemplatesApi } from '../../api/documentTemplates';

// Category icons mapping
const categoryIcons = {
  student: User,
  institution: Building2,
  session: Calendar,
  coordinator: GraduationCap,
  school: School,
  date: Clock
};

const PlaceholderPicker = ({ documentType, onInsert, className = '' }) => {
  const [placeholders, setPlaceholders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  // Fetch placeholders on mount or document type change
  useEffect(() => {
    const fetchPlaceholders = async () => {
      try {
        setLoading(true);
        const response = await documentTemplatesApi.getPlaceholders({ document_type: documentType });
        const rawData = response.data.data || response.data || {};
        
        // Transform backend format to component format
        // Backend returns: { student: [{ key, display, sample }], ... }
        // Component expects: { student: [{ placeholder_key, display_name, description }], ... }
        const transformedData = {};
        Object.entries(rawData).forEach(([categoryKey, items]) => {
          transformedData[categoryKey] = (items || []).map(item => ({
            placeholder_key: item.key,
            display_name: item.display,
            description: item.sample ? `Sample: ${item.sample}` : item.display
          }));
        });
        
        setPlaceholders(transformedData);
        
        // All categories collapsed by default
        const expanded = {};
        Object.keys(transformedData).forEach(key => {
          expanded[key] = false;
        });
        setExpandedCategories(expanded);
      } catch (err) {
        console.error('Failed to fetch placeholders:', err);
        setError('Failed to load placeholders');
      } finally {
        setLoading(false);
      }
    };

    fetchPlaceholders();
  }, [documentType]);

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Handle placeholder click - insert into editor
  const handleInsert = (placeholder) => {
    const placeholderText = `{${placeholder.placeholder_key}}`;
    if (onInsert) {
      onInsert(placeholderText, placeholder);
    }
  };

  // Copy placeholder to clipboard
  const handleCopy = async (placeholder, e) => {
    e.stopPropagation();
    const placeholderText = `{${placeholder.placeholder_key}}`;
    try {
      await navigator.clipboard.writeText(placeholderText);
      setCopiedKey(placeholder.placeholder_key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Filter placeholders by search term
  const filterPlaceholders = (categoryPlaceholders) => {
    if (!searchTerm) return categoryPlaceholders;
    
    const term = searchTerm.toLowerCase();
    return categoryPlaceholders.filter(p => 
      p.placeholder_key.toLowerCase().includes(term) ||
      p.display_name.toLowerCase().includes(term) ||
      (p.description && p.description.toLowerCase().includes(term))
    );
  };

  // Check if any placeholders match search in a category
  const hasMatchingPlaceholders = (categoryPlaceholders) => {
    return filterPlaceholders(categoryPlaceholders).length > 0;
  };

  if (loading) {
    return (
      <div className={`bg-white border-l border-gray-200 p-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-6 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white border-l border-gray-200 p-4 ${className}`}>
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className={`bg-white border-l border-gray-200 flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-2">Available Placeholders</h3>
        <p className="text-xs text-gray-500 mb-3">
          Click to insert or drag into editor
        </p>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search placeholders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md 
                     focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
      </div>

      {/* Placeholder List */}
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(placeholders).map(([categoryKey, categoryPlaceholders]) => {
          const filteredPlaceholders = filterPlaceholders(categoryPlaceholders || []);
          if (searchTerm && filteredPlaceholders.length === 0) return null;

          const IconComponent = categoryIcons[categoryKey] || Info;
          const isExpanded = expandedCategories[categoryKey];
          
          // Format category name for display (capitalize first letter)
          const categoryName = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);

          return (
            <div key={categoryKey} className="mb-2">
              {/* Category Header */}
              <Button
                variant="ghost"
                onClick={() => toggleCategory(categoryKey)}
                className="w-full justify-start gap-2 px-2 py-2 text-sm font-medium text-gray-700"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <IconComponent className="h-4 w-4 text-gray-500" />
                <span>{categoryName}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {filteredPlaceholders.length}
                </span>
              </Button>

              {/* Placeholder Items */}
              {isExpanded && (
                <div className="ml-4 space-y-1 mt-1">
                  {filteredPlaceholders.map((placeholder) => (
                    <div
                      key={placeholder.placeholder_key}
                      onClick={() => handleInsert(placeholder)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', `{${placeholder.placeholder_key}}`);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className="group flex items-center gap-2 px-2 py-1.5 text-sm 
                               bg-gray-50 hover:bg-green-50 border border-gray-200 
                               hover:border-green-300 rounded cursor-pointer transition-colors"
                      title={placeholder.description || placeholder.display_name}
                    >
                      <code className="flex-1 text-xs font-mono text-green-700 truncate">
                        {`{${placeholder.placeholder_key}}`}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleCopy(placeholder, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 h-auto"
                        title="Copy to clipboard"
                      >
                        <Copy className="h-3 w-3 text-gray-500" />
                      </Button>
                      {copiedKey === placeholder.placeholder_key && (
                        <span className="text-xs text-green-600">Copied!</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(placeholders).length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No placeholders available</p>
          </div>
        )}
      </div>

      {/* Footer - Help */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Syntax:</strong></p>
          <code className="block bg-white p-1 rounded border text-xs">
            {'{placeholder_name}'}
          </code>
          <p className="mt-2">
            Placeholders will be replaced with actual data when the document is generated.
          </p>
        </div>
      </div>
    </div>
  );
};

PlaceholderPicker.propTypes = {
  documentType: PropTypes.string,
  onInsert: PropTypes.func,
  className: PropTypes.string
};

export default PlaceholderPicker;

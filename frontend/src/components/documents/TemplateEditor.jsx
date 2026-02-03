/**
 * TemplateEditor Component
 * WYSIWYG editor wrapper for document templates
 * Uses TipTap for modern, React 18+ compatible rich text editing
 */

import { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Image } from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import PropTypes from 'prop-types';

// Resizable Image Component
const ResizableImageComponent = ({ node, updateAttributes, selected }) => {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = node.attrs.width || e.target.closest('.resizable-image-wrapper').querySelector('img').offsetWidth;
    const startHeight = node.attrs.height || e.target.closest('.resizable-image-wrapper').querySelector('img').offsetHeight;
    const aspectRatio = startWidth / startHeight;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction.includes('e')) {
        newWidth = Math.max(50, startWidth + deltaX);
      } else if (direction.includes('w')) {
        newWidth = Math.max(50, startWidth - deltaX);
      }

      if (direction.includes('s')) {
        newHeight = Math.max(50, startHeight + deltaY);
      } else if (direction.includes('n')) {
        newHeight = Math.max(50, startHeight - deltaY);
      }

      // Maintain aspect ratio for corner handles
      if (direction.length === 2) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          newHeight = newWidth / aspectRatio;
        } else {
          newWidth = newHeight * aspectRatio;
        }
      }

      updateAttributes({
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <NodeViewWrapper className="resizable-image-wrapper" style={{ display: 'inline-block', position: 'relative' }}>
      <div
        className={`relative inline-block ${selected ? 'ring-2 ring-blue-500' : ''} ${isResizing ? 'select-none' : ''}`}
        style={{ width: node.attrs.width ? `${node.attrs.width}px` : 'auto' }}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          title={node.attrs.title || ''}
          style={{
            width: node.attrs.width ? `${node.attrs.width}px` : 'auto',
            height: node.attrs.height ? `${node.attrs.height}px` : 'auto',
            maxWidth: '100%',
          }}
          draggable={false}
        />
        {selected && (
          <>
            {/* Corner handles */}
            <div
              className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-nw-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'nw')}
            />
            <div
              className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-ne-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'ne')}
            />
            <div
              className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-sw-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'sw')}
            />
            <div
              className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-se-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'se')}
            />
            {/* Edge handles */}
            <div
              className="absolute top-1/2 -left-1 w-2 h-6 -translate-y-1/2 bg-blue-500 border border-white cursor-w-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'w')}
            />
            <div
              className="absolute top-1/2 -right-1 w-2 h-6 -translate-y-1/2 bg-blue-500 border border-white cursor-e-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'e')}
            />
            <div
              className="absolute -top-1 left-1/2 w-6 h-2 -translate-x-1/2 bg-blue-500 border border-white cursor-n-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'n')}
            />
            <div
              className="absolute -bottom-1 left-1/2 w-6 h-2 -translate-x-1/2 bg-blue-500 border border-white cursor-s-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 's')}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};

ResizableImageComponent.propTypes = {
  node: PropTypes.object.isRequired,
  updateAttributes: PropTypes.func.isRequired,
  selected: PropTypes.bool,
};

// Custom resizable image extension
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width') || element.style.width?.replace('px', ''),
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { width: attributes.width, style: `width: ${attributes.width}px` };
        },
      },
      height: {
        default: null,
        parseHTML: element => element.getAttribute('height') || element.style.height?.replace('px', ''),
        renderHTML: attributes => {
          if (!attributes.height) return {};
          return { height: attributes.height, style: `height: ${attributes.height}px` };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconList,
  IconListNumbers,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustified,
  IconLink,
  IconPhoto,
  IconCode,
  IconClearFormatting,
  IconIndentIncrease,
  IconIndentDecrease,
  IconTextColor,
  IconHighlight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconLineHeight,
  IconTextSize
} from '@tabler/icons-react';

// Font size extension - extends TextStyle with fontSize attribute
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
        renderHTML: attributes => {
          if (!attributes.fontSize) {
            return {};
          }
          return {
            style: `font-size: ${attributes.fontSize}`,
          };
        },
      },
    };
  },
});

// Line height extension
const LineHeight = TextStyle.extend({
  name: 'lineHeight',
  addAttributes() {
    return {
      lineHeight: {
        default: null,
        parseHTML: element => element.style.lineHeight,
        renderHTML: attributes => {
          if (!attributes.lineHeight) {
            return {};
          }
          return {
            style: `line-height: ${attributes.lineHeight}`,
          };
        },
      },
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element => element.style.lineHeight,
            renderHTML: attributes => {
              if (!attributes.lineHeight) {
                return {};
              }
              return {
                style: `line-height: ${attributes.lineHeight}`,
              };
            },
          },
        },
      },
    ];
  },
});

// Toolbar button component
const ToolbarButton = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
      ${active ? 'bg-gray-200 text-green-600' : 'text-gray-600'}`}
  >
    {children}
  </button>
);

ToolbarButton.propTypes = {
  onClick: PropTypes.func,
  active: PropTypes.bool,
  disabled: PropTypes.bool,
  title: PropTypes.string,
  children: PropTypes.node,
};

// Toolbar divider
const ToolbarDivider = () => (
  <div className="w-px h-6 bg-gray-300 mx-1" />
);

// Dropdown component for font size and line height
const ToolbarDropdown = ({ value, options, onChange, title, icon: Icon }) => {
  const displayValue = value ? options.find(opt => opt.value === value)?.label : null;
  
  return (
    <div className="relative inline-flex items-center">
      {Icon && <Icon className="h-4 w-4 text-gray-500 mr-1" />}
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        className="appearance-none bg-transparent border border-gray-300 rounded px-2 py-1 pr-6 text-sm 
                   text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 cursor-pointer min-w-[60px]"
      >
        <option value="">{displayValue || title}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

ToolbarDropdown.propTypes = {
  value: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string,
    label: PropTypes.string,
  })),
  onChange: PropTypes.func,
  title: PropTypes.string,
  icon: PropTypes.elementType,
};

// Color picker button
const ColorPicker = ({ value, onChange, title, icon: Icon }) => (
  <div className="relative inline-block">
    <label title={title} className="cursor-pointer">
      <div className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors relative">
        <Icon className="h-4 w-4" />
        <div 
          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded"
          style={{ backgroundColor: value || '#000000' }}
        />
      </div>
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="absolute opacity-0 w-0 h-0"
      />
    </label>
  </div>
);

ColorPicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  title: PropTypes.string,
  icon: PropTypes.elementType,
};

// Font size options
const FONT_SIZES = [
  { value: '10px', label: '10px' },
  { value: '12px', label: '12px' },
  { value: '14px', label: '14px' },
  { value: '16px', label: '16px' },
  { value: '18px', label: '18px' },
  { value: '20px', label: '20px' },
  { value: '24px', label: '24px' },
  { value: '28px', label: '28px' },
  { value: '32px', label: '32px' },
  { value: '36px', label: '36px' },
  { value: '48px', label: '48px' },
];

// Line height options
const LINE_HEIGHTS = [
  { value: '1', label: '1.0' },
  { value: '1.15', label: '1.15' },
  { value: '1.5', label: '1.5' },
  { value: '1.75', label: '1.75' },
  { value: '2', label: '2.0' },
  { value: '2.5', label: '2.5' },
  { value: '3', label: '3.0' },
];

// Toolbar component
const EditorToolbar = ({ editor }) => {
  if (!editor) return null;

  const addImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result;
          if (base64) {
            editor.chain().focus().setImage({ src: base64 }).run();
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, [editor]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);
    
    if (url === null) return;
    
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const setFontSize = useCallback((size) => {
    if (size) {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    } else {
      editor.chain().focus().unsetMark('textStyle').run();
    }
  }, [editor]);

  const setLineHeight = useCallback((height) => {
    if (height) {
      editor.chain().focus().updateAttributes('paragraph', { lineHeight: height }).run();
    } else {
      editor.chain().focus().updateAttributes('paragraph', { lineHeight: null }).run();
    }
  }, [editor]);

  const currentFontSize = editor.getAttributes('textStyle').fontSize;
  const currentLineHeight = editor.getAttributes('paragraph').lineHeight;

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <IconArrowBackUp className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <IconArrowForwardUp className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <IconH1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <IconH2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <IconH3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        active={editor.isActive('heading', { level: 4 })}
        title="Heading 4"
      >
        <IconH4 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Font Size */}
      <ToolbarDropdown
        value={currentFontSize}
        options={FONT_SIZES}
        onChange={setFontSize}
        title="Size"
        icon={IconTextSize}
      />

      {/* Line Height */}
      <ToolbarDropdown
        value={currentLineHeight}
        options={LINE_HEIGHTS}
        onChange={setLineHeight}
        title="Line"
        icon={IconLineHeight}
      />

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <IconBold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <IconItalic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline"
      >
        <IconUnderline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <IconStrikethrough className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <IconAlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <IconAlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <IconAlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        active={editor.isActive({ textAlign: 'justify' })}
        title="Justify"
      >
        <IconAlignJustified className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <IconList className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <IconListNumbers className="h-4 w-4" />
      </ToolbarButton>

      {/* Indent */}
      <ToolbarButton
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        disabled={!editor.can().sinkListItem('listItem')}
        title="Increase Indent"
      >
        <IconIndentIncrease className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        disabled={!editor.can().liftListItem('listItem')}
        title="Decrease Indent"
      >
        <IconIndentDecrease className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Colors */}
      <ColorPicker
        value={editor.getAttributes('textStyle').color}
        onChange={(color) => editor.chain().focus().setColor(color).run()}
        title="Text Color"
        icon={IconTextColor}
      />
      <ColorPicker
        value={editor.getAttributes('highlight').color}
        onChange={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
        title="Highlight"
        icon={IconHighlight}
      />

      <ToolbarDivider />

      {/* Link and Image */}
      <ToolbarButton
        onClick={setLink}
        active={editor.isActive('link')}
        title="Link"
      >
        <IconLink className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={addImage}
        title="Image"
      >
        <IconPhoto className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Code block */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <IconCode className="h-4 w-4" />
      </ToolbarButton>

      {/* Clear formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        title="Clear Formatting"
      >
        <IconClearFormatting className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
};

EditorToolbar.propTypes = {
  editor: PropTypes.object,
};

const TemplateEditor = ({
  value,
  onChange,
  placeholder = 'Start designing your template...',
  readOnly = false,
  className = '',
  onInsertPlaceholder
}) => {
  const [isMounted, setIsMounted] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
      ResizableImage.configure({
        inline: true,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
  });

  // Update content when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  // Insert placeholder function
  const insertPlaceholder = useCallback((placeholderText) => {
    if (!editor) return;
    editor.chain().focus().insertContent(placeholderText).run();
  }, [editor]);

  // Expose insert method to parent
  useEffect(() => {
    if (onInsertPlaceholder) {
      onInsertPlaceholder.current = insertPlaceholder;
    }
  }, [insertPlaceholder, onInsertPlaceholder]);

  // Handle mount state
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (!isMounted) {
    return (
      <div className={`template-editor border border-gray-200 rounded-lg ${className}`}>
        <div className="p-2 border-b border-gray-200 bg-gray-50 h-12" />
        <div className="min-h-[400px] p-4 animate-pulse bg-gray-50" />
      </div>
    );
  }

  return (
    <div className={`template-editor ${className}`}>
      <style>{`
        .template-editor .ProseMirror {
          font-family: 'Times New Roman', Times, serif;
          font-size: 14px;
          min-height: 400px;
          padding: 1rem;
          outline: none;
          line-height: 1.6;
        }
        
        .template-editor .ProseMirror p {
          margin-bottom: 1em;
        }
        
        .template-editor .ProseMirror h1 {
          font-size: 2em;
          font-weight: bold;
          margin-bottom: 0.5em;
        }
        
        .template-editor .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin-bottom: 0.5em;
        }
        
        .template-editor .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: bold;
          margin-bottom: 0.5em;
        }
        
        .template-editor .ProseMirror h4 {
          font-size: 1.1em;
          font-weight: bold;
          margin-bottom: 0.5em;
        }
        
        .template-editor .ProseMirror ul,
        .template-editor .ProseMirror ol {
          padding-left: 1.5em;
          margin-bottom: 1em;
        }
        
        .template-editor .ProseMirror ul {
          list-style-type: disc;
        }
        
        .template-editor .ProseMirror ol {
          list-style-type: decimal;
        }
        
        .template-editor .ProseMirror img {
          max-width: 100%;
          height: auto;
          cursor: pointer;
        }
        
        .template-editor .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
        }
        
        .template-editor .ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          font-family: 'JetBrains Mono', monospace;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1em;
        }
        
        .template-editor .ProseMirror code {
          background: #f1f5f9;
          padding: 0.2em 0.4em;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        
        .template-editor .ProseMirror pre code {
          background: none;
          padding: 0;
          font-size: inherit;
          color: inherit;
        }
        
        .template-editor .ProseMirror blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 1em;
          margin-left: 0;
          margin-bottom: 1em;
          color: #6b7280;
        }
        
        .template-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }

        /* Image resize handle styles */
        .template-editor .ProseMirror .image-resizer {
          display: inline-block;
          position: relative;
          line-height: 0;
        }

        .template-editor .ProseMirror .image-resizer.ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
        }
      `}</style>
      
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {!readOnly && <EditorToolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

TemplateEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  readOnly: PropTypes.bool,
  className: PropTypes.string,
  onInsertPlaceholder: PropTypes.shape({
    current: PropTypes.func
  })
};

export default TemplateEditor;

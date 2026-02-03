# Icon Guidelines for DigitalTP Frontend

This project uses **Tabler Icons** (`@tabler/icons-react`) as the sole icon library. This document provides guidelines for using icons consistently throughout the application.

## Installation

Tabler Icons is already installed. If you need to reinstall:

```bash
npm install @tabler/icons-react
```

## Import Pattern

All Tabler icons are prefixed with `Icon`. Import them from `@tabler/icons-react`:

```jsx
import { IconUsers, IconCheck, IconAlertCircle } from '@tabler/icons-react';
```

## Common Icons Reference

Here's a quick reference for commonly used icons in this project:

### Navigation & Layout
| Icon | Name | Usage |
|------|------|-------|
| 🏠 | `IconLayoutDashboard` | Dashboard |
| ⚙️ | `IconSettings` | Settings |
| 🚪 | `IconLogout` | Logout |
| ☰ | `IconMenu2` | Mobile menu |
| ✕ | `IconX` | Close/dismiss |

### Users & People
| Icon | Name | Usage |
|------|------|-------|
| 👥 | `IconUsers` | Users/people list |
| 👤 | `IconUser` | Single user |
| 👤✓ | `IconUserCheck` | Verified user |
| 👤+ | `IconUserPlus` | Add user |

### Education
| Icon | Name | Usage |
|------|------|-------|
| 🎓 | `IconSchool` | Students/graduation |
| 🏛️ | `IconBuildingBank` | Academic/faculty |
| 🏫 | `IconBuilding` | Institution |
| 📚 | `IconBook` | Courses/programs |

### Files & Documents
| Icon | Name | Usage |
|------|------|-------|
| 📄 | `IconFileText` | Documents |
| 📊 | `IconFileSpreadsheet` | Excel/spreadsheets |
| ✓📄 | `IconFileCheck` | Verified document |
| ✍️ | `IconSignature` | Signed documents |

### Status & Feedback
| Icon | Name | Usage |
|------|------|-------|
| ✓ | `IconCheck` | Success/confirmed |
| ✓○ | `IconCircleCheck` | Success badge |
| ⚠️ | `IconAlertTriangle` | Warning |
| ⚠○ | `IconAlertCircle` | Alert/error |
| ℹ️ | `IconInfoCircle` | Information |

### Actions
| Icon | Name | Usage |
|------|------|-------|
| ✏️ | `IconPencil` | Edit |
| 🗑️ | `IconTrash` | Delete |
| 👁️ | `IconEye` | View/preview |
| ⬆️ | `IconUpload` | Upload |
| ⬇️ | `IconDownload` | Download |
| 🔄 | `IconRefresh` | Refresh |
| ➕ | `IconPlus` | Add/create |
| 🔍 | `IconSearch` | Search |

### Navigation Controls
| Icon | Name | Usage |
|------|------|-------|
| ◀ | `IconChevronLeft` | Previous |
| ▶ | `IconChevronRight` | Next |
| ⏮ | `IconChevronsLeft` | First page |
| ⏭ | `IconChevronsRight` | Last page |
| ▲ | `IconChevronUp` | Sort up/expand |
| ▼ | `IconChevronDown` | Sort down/collapse |

### Finance & Payments
| Icon | Name | Usage |
|------|------|-------|
| 💳 | `IconCreditCard` | Payments |
| 💰 | `IconCurrencyDollar` | Currency/money |
| 🧮 | `IconCalculator` | Calculations |
| 🧾 | `IconReceipt` | Receipts |

### Time & Calendar
| Icon | Name | Usage |
|------|------|-------|
| 📅 | `IconCalendar` | Dates/calendar |
| ✓📅 | `IconCalendarCheck` | Confirmed date |
| 🕐 | `IconClock` | Time/pending |

### Location
| Icon | Name | Usage |
|------|------|-------|
| 📍 | `IconMapPin` | Location |
| 🛣️ | `IconRoute` | Routes |

### Communication
| Icon | Name | Usage |
|------|------|-------|
| 📧 | `IconMail` | Email |
| 📞 | `IconPhone` | Phone |
| 📤 | `IconSend` | Send |

### Misc
| Icon | Name | Usage |
|------|------|-------|
| 🔒 | `IconLock` | Locked |
| 🔓 | `IconLockOpen` | Unlocked |
| ⭐ | `IconStar` | Rating/favorite |
| 📊 | `IconChartBar` | Charts/reports |
| 🔀 | `IconGitMerge` | Merge/groups |
| 📚 | `IconStack2` | Layers/stacks |
| ⏳ | `IconLoader2` | Loading (animated) |

## Usage Examples

### Basic Usage

```jsx
import { IconUsers } from '@tabler/icons-react';

function MyComponent() {
  return (
    <button>
      <IconUsers className="w-5 h-5" />
      Users
    </button>
  );
}
```

### Sizing

Use Tailwind classes for consistent sizing:

```jsx
// Small (navigation items, badges)
<IconCheck className="w-4 h-4" />

// Default (buttons, list items)
<IconUsers className="w-5 h-5" />

// Large (card headers, empty states)
<IconFileText className="w-6 h-6" />

// Extra large (hero sections, modals)
<IconAlertCircle className="w-8 h-8" />

// Huge (empty states, splash screens)
<IconSearch className="w-12 h-12" />
```

### Colors

Apply colors using Tailwind text classes:

```jsx
// Primary color
<IconCheck className="w-5 h-5 text-primary-600" />

// Success
<IconCircleCheck className="w-5 h-5 text-green-600" />

// Warning
<IconAlertTriangle className="w-5 h-5 text-amber-600" />

// Error
<IconAlertCircle className="w-5 h-5 text-red-600" />

// Muted
<IconUsers className="w-5 h-5 text-gray-400" />
```

### In Buttons

```jsx
import { IconPlus, IconDownload } from '@tabler/icons-react';

<Button>
  <IconPlus className="w-4 h-4 mr-2" />
  Add New
</Button>

<Button variant="outline">
  <IconDownload className="w-4 h-4 mr-2" />
  Download
</Button>
```

### As Dynamic Icons (e.g., navigation)

```jsx
import { IconLayoutDashboard, IconUsers, IconSettings } from '@tabler/icons-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: IconLayoutDashboard },
  { name: 'Users', href: '/users', icon: IconUsers },
  { name: 'Settings', href: '/settings', icon: IconSettings },
];

function Navigation() {
  return (
    <nav>
      {navigation.map((item) => (
        <a key={item.name} href={item.href}>
          <item.icon className="w-5 h-5" />
          {item.name}
        </a>
      ))}
    </nav>
  );
}
```

### Loading State

```jsx
import { IconLoader2 } from '@tabler/icons-react';

<IconLoader2 className="w-5 h-5 animate-spin" />
```

## Finding Icons

To find more icons:

1. Visit [Tabler Icons](https://tabler-icons.io/)
2. Search for the icon you need
3. The icon name becomes `Icon` + PascalCase name (e.g., `arrow-right` → `IconArrowRight`)

## Migration from Other Libraries

If you're migrating from Lucide or another library:

| Lucide | Tabler |
|--------|--------|
| `Users` | `IconUsers` |
| `Check` | `IconCheck` |
| `X` | `IconX` |
| `AlertCircle` | `IconAlertCircle` |
| `CheckCircle` | `IconCircleCheck` |
| `XCircle` | `IconCircleX` |
| `GraduationCap` | `IconSchool` |
| `Building2` | `IconBuilding` |
| `LogOut` | `IconLogout` |
| `Menu` | `IconMenu2` |
| `RefreshCw` | `IconRefresh` |
| `BarChart3` | `IconChartBar` |
| `Trash2` | `IconTrash` |
| `Loader2` | `IconLoader2` |
| `DollarSign` | `IconCurrencyDollar` |
| `Info` | `IconInfoCircle` |
| `ImageIcon` | `IconPhoto` |
| `MoreVertical` | `IconDotsVertical` |
| `Save` | `IconDeviceFloppy` |

## Best Practices

1. **Consistency**: Use the same icon for the same action throughout the app
2. **Accessibility**: Include `aria-label` or `title` for icon-only buttons
3. **Size**: Match icon sizes with text content (small text = small icons)
4. **Color**: Use semantic colors (green = success, red = error, etc.)
5. **Spacing**: Use `mr-2` for icons before text in buttons

## Do NOT Use

- ❌ `lucide-react` - Removed from project
- ❌ `heroicons` - Not installed
- ❌ `react-icons` - Not installed
- ❌ Inline SVGs (unless absolutely necessary)

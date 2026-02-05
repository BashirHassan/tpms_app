# Dynamic Allowance Calculation System

> **Feature:** Customizable allowance calculation engine allowing institutions to define their own formulas, variables, and operators
> **Status:** Proposed
> **Created:** February 3, 2026

---

## Executive Summary

This document outlines the implementation of a **dynamic allowance calculation system** that allows super admins (or institution admins) to customize how allowances are calculated. Instead of hard-coded formulas, institutions can define their own:

- **Variables** (distance, rank rates, visit count, etc.)
- **Operators** (+, -, ×, ÷, %, min, max, conditional)
- **Rules** (conditions that determine which formula to apply)
- **Allowance Types** (institutions can add/remove/rename allowance categories)

---

## Current System Analysis

### Current Data Model

**Ranks Table** - Stores fixed allowance rates per rank:
```sql
CREATE TABLE `ranks` (
  `id` bigint(20) NOT NULL,
  `institution_id` bigint(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(20) NOT NULL,
  `local_running_allowance` decimal(10,2) DEFAULT 0.00,
  `transport_per_km` decimal(10,2) DEFAULT 0.00,
  `dsa` decimal(10,2) DEFAULT 0.00,
  `dta` decimal(10,2) DEFAULT 0.00,
  `tetfund` decimal(10,2) DEFAULT 0.00,
  `other_allowances` longtext DEFAULT NULL,  -- JSON array
  ...
);
```

**Academic Sessions Table** - Stores threshold settings:
```sql
`inside_distance_threshold_km` decimal(10,2) DEFAULT 10.00,
`dsa_enabled` tinyint(1) DEFAULT 0,
`dsa_min_distance_km` decimal(10,2) DEFAULT 11.00,
`dsa_max_distance_km` decimal(10,2) DEFAULT 30.00,
`dsa_percentage` decimal(5,2) DEFAULT 50.00,
```

### Current Calculation Logic

Located in `backend/src/controllers/postingController.js`:

```javascript
function calculateAllowances(supervisor, school, session, isSecondary = false) {
  // RULE 1: Inside (distance <= threshold)
  if (locationCategory === 'inside') {
    localRunning = localRunningRate;  // Only local running
    // All others = 0
  }
  // RULE 2: DSA range (enabled && min <= distance <= max)
  else if (dsaEnabled && distanceKm >= dsaMinDistance && distanceKm <= dsaMaxDistance) {
    transport = transportPerKm * distanceKm;
    dsa = (dtaRate * dsaPercentage) / 100;
    tetfund = tetfundRate;
  }
  // RULE 3: Outside (full DTA)
  else {
    transport = transportPerKm * distanceKm;
    dta = dtaRate;
    tetfund = tetfundRate;
  }
}
```

### Current Limitations

1. **Fixed Allowance Types** - Cannot add new types like "Hazard Allowance" or "Rural Posting Bonus"
2. **Fixed Formulas** - Transport is always `rate × distance`, cannot be `rate × distance × factor`
3. **Fixed Rules** - Only 3 distance-based categories (inside, DSA, outside)
4. **No Institution Customization** - All institutions use the same formula logic

---

## Proposed Solution: Dynamic Calculation Engine

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ALLOWANCE CONFIGURATION                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ ALLOWANCE TYPES │  │   VARIABLES     │  │     RULES       │     │
│  │ (Categories)    │  │ (Inputs)        │  │ (Conditions)    │     │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤     │
│  │ • Transport     │  │ • distance_km   │  │ IF distance<=10 │     │
│  │ • DSA           │  │ • rank_dta      │  │ IF dsa_enabled  │     │
│  │ • DTA           │  │ • rank_transport│  │ IF visit_num>1  │     │
│  │ • Local Running │  │ • visit_number  │  │ ...             │     │
│  │ • TETFund       │  │ • session.*     │  │                 │     │
│  │ • (Custom...)   │  │ • (Custom...)   │  │                 │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    FORMULA ENGINE                            │   │
│  │  transport = rank_transport_rate * distance_km              │   │
│  │  dsa = rank_dta * (session_dsa_percentage / 100)            │   │
│  │  local_running = rank_local_running                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    CALCULATION OUTPUT                               │
│  { transport: 14000, dsa: 0, dta: 25000, local_running: 0, ... }   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### 1. Allowance Types Table

```sql
-- Defines the allowance categories an institution uses
CREATE TABLE `allowance_types` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `code` varchar(50) NOT NULL,           -- e.g., 'transport', 'dsa', 'hazard_bonus'
  `name` varchar(100) NOT NULL,          -- e.g., 'Transport Allowance'
  `description` text DEFAULT NULL,
  `is_system` tinyint(1) DEFAULT 0,      -- System types cannot be deleted
  `is_per_visit` tinyint(1) DEFAULT 1,   -- Per visit or once per session
  `display_order` int(11) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_institution_code` (`institution_id`, `code`),
  FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Default system allowance types (seeded per institution)
-- transport, dsa, dta, local_running, tetfund
```

### 2. Calculation Variables Table

```sql
-- Defines available variables for formulas
CREATE TABLE `allowance_variables` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `code` varchar(50) NOT NULL,           -- e.g., 'distance_km', 'rank_dta'
  `name` varchar(100) NOT NULL,          -- Human-readable name
  `description` text DEFAULT NULL,
  `source` enum('rank', 'session', 'posting', 'school', 'custom') NOT NULL,
  `source_field` varchar(100) DEFAULT NULL,  -- e.g., 'dta' from ranks table
  `data_type` enum('number', 'boolean', 'string') DEFAULT 'number',
  `default_value` varchar(255) DEFAULT '0',
  `is_system` tinyint(1) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_institution_code` (`institution_id`, `code`)
) ENGINE=InnoDB;

-- System variables (seeded per institution):
-- distance_km, rank_local_running, rank_transport_rate, rank_dsa, rank_dta, rank_tetfund
-- session_inside_threshold, session_dsa_enabled, session_dsa_min, session_dsa_max, session_dsa_percentage
-- visit_number, is_primary_posting, is_inside, is_dsa_range, is_outside
```

### 3. Calculation Rules Table

```sql
-- Defines conditions for rule groups (which formula set to apply)
CREATE TABLE `allowance_rules` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `name` varchar(100) NOT NULL,          -- e.g., 'Inside Posting Rule'
  `description` text DEFAULT NULL,
  `priority` int(11) DEFAULT 0,          -- Higher priority rules checked first
  `condition_expression` text NOT NULL,  -- JSON expression or simple condition
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_institution_priority` (`institution_id`, `priority` DESC)
) ENGINE=InnoDB;

-- Example condition_expression (JSON format):
-- {"operator": "<=", "left": "distance_km", "right": "session_inside_threshold"}
-- {"operator": "AND", "conditions": [
--   {"operator": "==", "left": "session_dsa_enabled", "right": true},
--   {"operator": ">=", "left": "distance_km", "right": "session_dsa_min"},
--   {"operator": "<=", "left": "distance_km", "right": "session_dsa_max"}
-- ]}
```

### 4. Allowance Formulas Table

```sql
-- Defines the formula for each allowance type under each rule
CREATE TABLE `allowance_formulas` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `rule_id` bigint(20) NOT NULL,          -- Which rule this formula belongs to
  `allowance_type_id` bigint(20) NOT NULL,-- Which allowance type
  `formula_expression` text NOT NULL,      -- The calculation formula
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_type` (`rule_id`, `allowance_type_id`),
  FOREIGN KEY (`rule_id`) REFERENCES `allowance_rules`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`allowance_type_id`) REFERENCES `allowance_types`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Example formula_expression values:
-- "rank_transport_rate * distance_km"
-- "rank_dta * (session_dsa_percentage / 100)"
-- "rank_local_running"
-- "0"  (when allowance doesn't apply)
-- "rank_dta * 1.5"  (custom multiplier)
-- "MAX(rank_transport_rate * distance_km, 5000)"  (minimum floor)
```

### 5. Rank Custom Values Table

```sql
-- Stores custom variable values per rank (extends the ranks table)
CREATE TABLE `rank_allowance_values` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `rank_id` bigint(20) NOT NULL,
  `variable_id` bigint(20) NOT NULL,      -- Links to allowance_variables
  `value` decimal(15,2) NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rank_variable` (`rank_id`, `variable_id`),
  FOREIGN KEY (`rank_id`) REFERENCES `ranks`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`variable_id`) REFERENCES `allowance_variables`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## Backend Implementation

### 1. Formula Parser Service

```javascript
// backend/src/services/formulaParserService.js

/**
 * Supported operators:
 * Arithmetic: +, -, *, /, %, ^
 * Comparison: ==, !=, <, <=, >, >=
 * Logical: AND, OR, NOT
 * Functions: MIN, MAX, IF, ROUND, FLOOR, CEIL, ABS
 */

class FormulaParser {
  constructor() {
    this.operators = {
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => b !== 0 ? a / b : 0,
      '%': (a, b) => a % b,
      '^': (a, b) => Math.pow(a, b),
    };

    this.comparisons = {
      '==': (a, b) => a === b,
      '!=': (a, b) => a !== b,
      '<': (a, b) => a < b,
      '<=': (a, b) => a <= b,
      '>': (a, b) => a > b,
      '>=': (a, b) => a >= b,
    };

    this.functions = {
      'MIN': (...args) => Math.min(...args),
      'MAX': (...args) => Math.max(...args),
      'ROUND': (value, decimals = 0) => Number(value.toFixed(decimals)),
      'FLOOR': (value) => Math.floor(value),
      'CEIL': (value) => Math.ceil(value),
      'ABS': (value) => Math.abs(value),
      'IF': (condition, trueVal, falseVal) => condition ? trueVal : falseVal,
    };
  }

  /**
   * Evaluate a formula expression with given variable context
   * @param {string} expression - Formula like "rank_dta * distance_km"
   * @param {Object} context - Variable values { distance_km: 100, rank_dta: 25000 }
   * @returns {number} Calculated result
   */
  evaluate(expression, context) {
    // Tokenize and parse the expression
    const tokens = this.tokenize(expression);
    const ast = this.parse(tokens);
    return this.evaluateAst(ast, context);
  }

  /**
   * Evaluate a condition expression
   * @param {Object} condition - JSON condition object
   * @param {Object} context - Variable values
   * @returns {boolean} Whether condition is met
   */
  evaluateCondition(condition, context) {
    if (condition.operator === 'AND') {
      return condition.conditions.every(c => this.evaluateCondition(c, context));
    }
    if (condition.operator === 'OR') {
      return condition.conditions.some(c => this.evaluateCondition(c, context));
    }
    if (condition.operator === 'NOT') {
      return !this.evaluateCondition(condition.condition, context);
    }

    const left = this.resolveValue(condition.left, context);
    const right = this.resolveValue(condition.right, context);
    
    return this.comparisons[condition.operator](left, right);
  }

  resolveValue(value, context) {
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string' && context.hasOwnProperty(value)) {
      return context[value];
    }
    return parseFloat(value) || 0;
  }

  // ... tokenize(), parse(), evaluateAst() implementations
}

module.exports = new FormulaParser();
```

### 2. Allowance Calculation Service

```javascript
// backend/src/services/allowanceCalculationService.js

const { query } = require('../db/database');
const formulaParser = require('./formulaParserService');

class AllowanceCalculationService {
  /**
   * Calculate allowances for a posting
   * @param {Object} params
   * @param {number} params.institutionId
   * @param {Object} params.supervisor - With rank info
   * @param {Object} params.school - With distance
   * @param {Object} params.session - With threshold settings
   * @param {Object} params.posting - Posting details
   * @returns {Object} Calculated allowances by type
   */
  async calculate({ institutionId, supervisor, school, session, posting }) {
    // 1. Build the variable context
    const context = this.buildContext(supervisor, school, session, posting);

    // 2. Get active rules ordered by priority
    const rules = await this.getRules(institutionId);

    // 3. Find the first matching rule
    let matchedRule = null;
    for (const rule of rules) {
      const condition = JSON.parse(rule.condition_expression);
      if (formulaParser.evaluateCondition(condition, context)) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      console.warn('No matching rule found, using defaults');
      return this.getDefaultAllowances(institutionId);
    }

    // 4. Get formulas for the matched rule
    const formulas = await this.getFormulas(matchedRule.id);

    // 5. Calculate each allowance type
    const result = {};
    let total = 0;

    for (const formula of formulas) {
      const value = formulaParser.evaluate(formula.formula_expression, context);
      result[formula.allowance_code] = value;
      total += value;
    }

    result.total = total;
    result.matched_rule = matchedRule.name;

    return result;
  }

  buildContext(supervisor, school, session, posting) {
    return {
      // Distance
      distance_km: parseFloat(school.distance_km) || 0,
      
      // Rank-based rates
      rank_local_running: parseFloat(supervisor.local_running_allowance) || 0,
      rank_transport_rate: parseFloat(supervisor.transport_per_km) || 0,
      rank_dsa: parseFloat(supervisor.dsa) || 0,
      rank_dta: parseFloat(supervisor.dta) || 0,
      rank_tetfund: parseFloat(supervisor.tetfund) || 0,
      
      // Session settings
      session_inside_threshold: parseFloat(session.inside_distance_threshold_km) || 10,
      session_dsa_enabled: session.dsa_enabled === 1 || session.dsa_enabled === true,
      session_dsa_min: parseFloat(session.dsa_min_distance_km) || 11,
      session_dsa_max: parseFloat(session.dsa_max_distance_km) || 30,
      session_dsa_percentage: parseFloat(session.dsa_percentage) || 50,
      
      // Posting details
      visit_number: parseInt(posting.visit_number) || 1,
      is_primary_posting: posting.is_primary_posting === 1,
      
      // Computed booleans
      is_inside: parseFloat(school.distance_km) <= parseFloat(session.inside_distance_threshold_km),
      is_dsa_range: this.isInDsaRange(school, session),
      is_outside: parseFloat(school.distance_km) > parseFloat(session.inside_distance_threshold_km),
    };
  }

  isInDsaRange(school, session) {
    if (!session.dsa_enabled) return false;
    const distance = parseFloat(school.distance_km) || 0;
    const min = parseFloat(session.dsa_min_distance_km) || 11;
    const max = parseFloat(session.dsa_max_distance_km) || 30;
    return distance >= min && distance <= max;
  }

  async getRules(institutionId) {
    return await query(
      `SELECT * FROM allowance_rules 
       WHERE institution_id = ? AND is_active = 1 
       ORDER BY priority DESC`,
      [institutionId]
    );
  }

  async getFormulas(ruleId) {
    return await query(
      `SELECT f.*, t.code as allowance_code 
       FROM allowance_formulas f
       JOIN allowance_types t ON f.allowance_type_id = t.id
       WHERE f.rule_id = ?`,
      [ruleId]
    );
  }

  async getDefaultAllowances(institutionId) {
    const types = await query(
      `SELECT code FROM allowance_types WHERE institution_id = ? AND status = 'active'`,
      [institutionId]
    );
    const result = {};
    types.forEach(t => result[t.code] = 0);
    result.total = 0;
    return result;
  }
}

module.exports = new AllowanceCalculationService();
```

### 3. API Endpoints

```javascript
// backend/src/routes/allowanceConfig.js

const router = require('express').Router({ mergeParams: true });
const { authenticate, requireInstitutionAccess, isHeadOfTP } = require('../middleware');
const controller = require('../controllers/allowanceConfigController');

// Allowance Types
router.get('/:institutionId/allowance-config/types', authenticate, requireInstitutionAccess(), controller.getTypes);
router.post('/:institutionId/allowance-config/types', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.createType);
router.put('/:institutionId/allowance-config/types/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.updateType);
router.delete('/:institutionId/allowance-config/types/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.deleteType);

// Variables
router.get('/:institutionId/allowance-config/variables', authenticate, requireInstitutionAccess(), controller.getVariables);
router.post('/:institutionId/allowance-config/variables', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.createVariable);

// Rules
router.get('/:institutionId/allowance-config/rules', authenticate, requireInstitutionAccess(), controller.getRules);
router.post('/:institutionId/allowance-config/rules', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.createRule);
router.put('/:institutionId/allowance-config/rules/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.updateRule);
router.delete('/:institutionId/allowance-config/rules/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.deleteRule);

// Formulas
router.get('/:institutionId/allowance-config/rules/:ruleId/formulas', authenticate, requireInstitutionAccess(), controller.getFormulas);
router.put('/:institutionId/allowance-config/rules/:ruleId/formulas', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.updateFormulas);

// Test Calculator
router.post('/:institutionId/allowance-config/test', authenticate, requireInstitutionAccess(), isHeadOfTP, controller.testCalculation);

module.exports = router;
```

---

## Frontend Implementation

### 1. Allowance Configuration Page

```jsx
// frontend/src/pages/admin/AllowanceConfigPage.jsx

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@radix-ui/react-tabs';
import AllowanceTypesTab from './tabs/AllowanceTypesTab';
import VariablesTab from './tabs/VariablesTab';
import RulesTab from './tabs/RulesTab';
import FormulaBuilderTab from './tabs/FormulaBuilderTab';
import TestCalculatorTab from './tabs/TestCalculatorTab';

function AllowanceConfigPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Allowance Calculation Configuration</h1>
      
      <Tabs defaultValue="types">
        <TabsList>
          <TabsTrigger value="types">Allowance Types</TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="rules">Rules & Conditions</TabsTrigger>
          <TabsTrigger value="formulas">Formulas</TabsTrigger>
          <TabsTrigger value="test">Test Calculator</TabsTrigger>
        </TabsList>

        <TabsContent value="types"><AllowanceTypesTab /></TabsContent>
        <TabsContent value="variables"><VariablesTab /></TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="formulas"><FormulaBuilderTab /></TabsContent>
        <TabsContent value="test"><TestCalculatorTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

### 2. Visual Formula Builder Component

```jsx
// frontend/src/components/FormulaBuilder.jsx

function FormulaBuilder({ formula, variables, onChange }) {
  const [tokens, setTokens] = useState(parseFormula(formula));

  const availableOperators = ['+', '-', '*', '/', '%'];
  const availableFunctions = ['MIN', 'MAX', 'ROUND', 'IF'];

  const addVariable = (variableCode) => {
    setTokens([...tokens, { type: 'variable', value: variableCode }]);
  };

  const addOperator = (op) => {
    setTokens([...tokens, { type: 'operator', value: op }]);
  };

  const addNumber = (num) => {
    setTokens([...tokens, { type: 'number', value: num }]);
  };

  return (
    <div className="space-y-4">
      {/* Visual Formula Display */}
      <div className="p-4 bg-gray-100 rounded-lg min-h-[60px] flex flex-wrap gap-2">
        {tokens.map((token, idx) => (
          <FormulaToken 
            key={idx} 
            token={token} 
            onRemove={() => removeToken(idx)}
          />
        ))}
      </div>

      {/* Variable Palette */}
      <div className="border rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">Variables</h4>
        <div className="flex flex-wrap gap-2">
          {variables.map(v => (
            <button
              key={v.code}
              onClick={() => addVariable(v.code)}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>

      {/* Operators */}
      <div className="flex gap-2">
        {availableOperators.map(op => (
          <button
            key={op}
            onClick={() => addOperator(op)}
            className="w-10 h-10 bg-gray-200 rounded font-mono text-lg hover:bg-gray-300"
          >
            {op}
          </button>
        ))}
      </div>

      {/* Resulting Expression */}
      <div className="text-sm text-gray-500">
        Expression: <code>{tokensToString(tokens)}</code>
      </div>
    </div>
  );
}
```

### 3. Condition Builder Component

```jsx
// frontend/src/components/ConditionBuilder.jsx

function ConditionBuilder({ condition, variables, onChange }) {
  const [conditionType, setConditionType] = useState(
    condition?.operator === 'AND' || condition?.operator === 'OR' 
      ? 'group' 
      : 'simple'
  );

  if (conditionType === 'simple') {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded">
        <select 
          value={condition?.left || ''}
          onChange={(e) => onChange({ ...condition, left: e.target.value })}
          className="border rounded px-2 py-1"
        >
          <option value="">Select Variable</option>
          {variables.map(v => (
            <option key={v.code} value={v.code}>{v.name}</option>
          ))}
        </select>

        <select
          value={condition?.operator || '=='}
          onChange={(e) => onChange({ ...condition, operator: e.target.value })}
          className="border rounded px-2 py-1"
        >
          <option value="==">equals</option>
          <option value="!=">not equals</option>
          <option value="<">less than</option>
          <option value="<=">less than or equal</option>
          <option value=">">greater than</option>
          <option value=">=">greater than or equal</option>
        </select>

        <input
          type="text"
          value={condition?.right || ''}
          onChange={(e) => onChange({ ...condition, right: e.target.value })}
          placeholder="Value or variable"
          className="border rounded px-2 py-1"
        />
      </div>
    );
  }

  // Group condition (AND/OR)
  return (
    <div className="border rounded p-4 space-y-2">
      <select
        value={condition?.operator || 'AND'}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className="font-medium"
      >
        <option value="AND">ALL of (AND)</option>
        <option value="OR">ANY of (OR)</option>
      </select>

      {condition?.conditions?.map((subCondition, idx) => (
        <ConditionBuilder
          key={idx}
          condition={subCondition}
          variables={variables}
          onChange={(updated) => {
            const newConditions = [...condition.conditions];
            newConditions[idx] = updated;
            onChange({ ...condition, conditions: newConditions });
          }}
        />
      ))}

      <button onClick={() => addSubCondition()}>+ Add Condition</button>
    </div>
  );
}
```

---

## Migration Strategy

### Phase 1: Database Schema

1. Create migration for new tables:
   - `allowance_types`
   - `allowance_variables`
   - `allowance_rules`
   - `allowance_formulas`
   - `rank_allowance_values`

2. Seed default data for existing institutions:
   - Convert current allowance types to `allowance_types` rows
   - Create system variables from current logic
   - Create 3 default rules (inside, DSA, outside)
   - Create default formulas matching current logic

### Phase 2: Backend Services

1. Implement `FormulaParserService`
2. Implement `AllowanceCalculationService`
3. Create controller and routes
4. Add feature toggle: `dynamic_allowance_calculation`

### Phase 3: Integration

1. Modify `postingController.calculateAllowances()`:
   ```javascript
   async function calculateAllowances(supervisor, school, session, isSecondary = false) {
     // Check if dynamic calculation is enabled
     const isEnabled = await isFeatureEnabled(institutionId, 'dynamic_allowance_calculation');
     
     if (isEnabled) {
       return allowanceCalculationService.calculate({ ... });
     }
     
     // Fallback to current hard-coded logic
     return legacyCalculateAllowances(supervisor, school, session, isSecondary);
   }
   ```

2. Update all allowance reporting queries to use `allowance_types`

### Phase 4: Frontend

1. Build AllowanceConfigPage with tabs
2. Create FormulaBuilder component
3. Create ConditionBuilder component
4. Create TestCalculator component
5. Add navigation and permissions

### Phase 5: Testing & Rollout

1. Unit tests for FormulaParser
2. Integration tests for calculation service
3. Enable for pilot institution
4. Monitor and gather feedback
5. Gradual rollout to all institutions

---

## Example Configurations

### Example 1: Standard Nigerian College of Education

**Rules:**
1. Inside Rule (priority 100): `distance_km <= session_inside_threshold`
2. DSA Rule (priority 50): `session_dsa_enabled AND distance_km >= session_dsa_min AND distance_km <= session_dsa_max`
3. Outside Rule (priority 10): `distance_km > session_inside_threshold`

**Formulas for Inside Rule:**
| Type | Formula |
|------|---------|
| local_running | `rank_local_running` |
| transport | `0` |
| dsa | `0` |
| dta | `0` |
| tetfund | `0` |

**Formulas for DSA Rule:**
| Type | Formula |
|------|---------|
| local_running | `0` |
| transport | `rank_transport_rate * distance_km` |
| dsa | `rank_dta * (session_dsa_percentage / 100)` |
| dta | `0` |
| tetfund | `rank_tetfund` |

**Formulas for Outside Rule:**
| Type | Formula |
|------|---------|
| local_running | `0` |
| transport | `rank_transport_rate * distance_km` |
| dsa | `0` |
| dta | `rank_dta` |
| tetfund | `rank_tetfund` |

### Example 2: University with Hazard Allowance

**Custom Allowance Type:** `hazard` - Hazard Allowance

**Custom Variable:** `school_is_rural` (boolean from school data)

**Additional Rule:** Rural Posting Rule (priority 75): `school_is_rural == true AND distance_km > session_inside_threshold`

**Formulas for Rural Rule:**
| Type | Formula |
|------|---------|
| transport | `rank_transport_rate * distance_km * 1.25` |
| hazard | `rank_dta * 0.10` |
| dta | `rank_dta` |

---

## Security Considerations

1. **Formula Validation** - Sanitize and validate all formula expressions before storage
2. **Execution Sandboxing** - The formula parser should not allow arbitrary code execution
3. **Rate Limiting** - Limit the complexity of formulas (max tokens, max depth)
4. **Audit Logging** - Log all configuration changes
5. **Permission Control** - Only `head_of_teaching_practice` or `super_admin` can modify configuration

---

## Success Metrics

1. **Adoption Rate** - % of institutions using custom configurations
2. **Configuration Time** - Time to set up custom calculations
3. **Support Tickets** - Reduction in "can we customize allowance X" requests
4. **Accuracy** - Allowance calculation accuracy vs manual calculations

---

## Appendix: Default System Variables

| Code | Name | Source | Description |
|------|------|--------|-------------|
| `distance_km` | Distance (km) | posting | Distance from institution to school |
| `rank_local_running` | Local Running Rate | rank | Rate for inside postings |
| `rank_transport_rate` | Transport per KM | rank | Rate per kilometer |
| `rank_dsa` | DSA Base Rate | rank | Daily Subsistence Allowance rate |
| `rank_dta` | DTA Rate | rank | Daily Transport Allowance rate |
| `rank_tetfund` | TETFund Rate | rank | TETFUND allowance rate |
| `session_inside_threshold` | Inside Threshold | session | Distance threshold for inside classification |
| `session_dsa_enabled` | DSA Enabled | session | Whether DSA range is active |
| `session_dsa_min` | DSA Min Distance | session | Minimum distance for DSA |
| `session_dsa_max` | DSA Max Distance | session | Maximum distance for DSA |
| `session_dsa_percentage` | DSA Percentage | session | DSA as % of DTA |
| `visit_number` | Visit Number | posting | Which visit (1, 2, 3...) |
| `is_primary_posting` | Is Primary | posting | True for primary, false for secondary |
| `is_inside` | Is Inside | computed | `distance_km <= session_inside_threshold` |
| `is_outside` | Is Outside | computed | `distance_km > session_inside_threshold` |
| `is_dsa_range` | Is DSA Range | computed | Within DSA distance range |

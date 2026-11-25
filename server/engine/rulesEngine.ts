import type {
  DocumentRecord,
  EligibilityEvaluationResult,
  ImpactItem,
  ImpactReport,
  LanguageCode,
  ReadinessCheckItem,
  ReadinessReport,
  RuleRecord,
  RuleUsefulnessStat,
  SchemeUsageStat,
  UserRole,
  WhatIfResult,
} from '../../src/types/niyamsetu.ts';
import { db } from './store.ts';

export function formatInr(amount: number | string): string {
  const num = Number(amount);
  if (Number.isNaN(num)) return String(amount);
  return '₹' + num.toLocaleString('en-IN');
}

export function formatDateReadable(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRuleDisplay(rule: RuleRecord): string {
  if (rule.field === 'family_income') {
    return `${rule.operator} ${formatInr(rule.value)}`;
  }
  if (rule.field === 'marks_percent') {
    return `${rule.operator} ${rule.value}%`;
  }
  if (rule.rule_type === 'deadline') {
    return formatDateReadable(String(rule.value));
  }
  return String(rule.value);
}

export function buildCitation(rule: RuleRecord, docs?: DocumentRecord[]): string {
  const docList = docs || db.getState().documents;
  const doc = docList.find((d) => d.id === rule.document_id);
  const docLabel = doc ? doc.doc_number : rule.document_id;
  return `${docLabel} · p.${rule.page_number} · cl.${rule.clause_reference}`;
}

export function getActiveRulesForScheme(schemeId: string): RuleRecord[] {
  const state = db.getState();
  return state.rules
    .filter((r) => r.scheme_id === schemeId && r.status === 'active')
    .sort((a, b) => b.version - a.version);
}

export function getActiveRuleByKey(schemeId: string, ruleKey: string): RuleRecord | undefined {
  const state = db.getState();
  return state.rules
    .filter((r) => r.scheme_id === schemeId && r.rule_key === ruleKey && r.status === 'active')
    .sort((a, b) => b.version - a.version)[0];
}

export function appendAuditLog(params: {
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  objectType: string;
  objectId: string;
  sourceReference: string;
  details: string;
}): void {
  const state = db.getState();
  state.audit_log.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor_id: params.actorId,
    actor_name: params.actorName,
    actor_role: params.actorRole,
    action: params.action,
    object_type: params.objectType,
    object_id: params.objectId,
    source_reference: params.sourceReference,
    details: params.details,
    timestamp: new Date().toISOString(),
  });
}

export interface VersionComparisonRow {
  rule_key: string;
  label: string;
  old_rule: RuleRecord | null;
  new_rule: RuleRecord | null;
  old_display: string;
  new_display: string;
  change_type: 'added' | 'modified' | 'removed' | 'unchanged';
  citation: string;
  review_status: RuleRecord['status'];
}

export function compareSchemeVersions(schemeId: string): VersionComparisonRow[] {
  const state = db.getState();
  const schemeRules = state.rules.filter((r) => r.scheme_id === schemeId);
  const keys = Array.from(new Set(schemeRules.map((r) => r.rule_key)));

  return keys.flatMap((key) => {
    const versions = schemeRules
      .filter((r) => r.rule_key === key)
      .sort((a, b) => a.version - b.version);
    if (versions.length === 0) return [];

    const v1 = versions.find((r) => r.version === 1) || null;
    const latest =
      versions.length > 1
        ? versions[versions.length - 1]
        : !v1
          ? versions[0]
          : null;

    let changeType: VersionComparisonRow['change_type'] = 'unchanged';
    if (latest && !v1) changeType = 'added';
    else if (latest && v1) changeType = 'modified';

    const refRule = latest || v1 || versions[versions.length - 1];
    if (!refRule) return [];

    return [{
      rule_key: key,
      label: refRule.label || key,
      old_rule: v1,
      new_rule: latest,
      old_display: v1 ? formatRuleDisplay(v1) : '—',
      new_display: latest ? formatRuleDisplay(latest) : 'No change',
      change_type: changeType,
      citation: buildCitation(refRule),
      review_status: refRule.status,
    }];
  });
}

export function createImpactReportForRuleChange(
  newRule: RuleRecord,
  oldRule: RuleRecord | null
): ImpactReport | null {
  const state = db.getState();
  const links = state.rule_links.filter(
    (l) => l.scheme_id === newRule.scheme_id && l.rule_key === newRule.rule_key
  );

  // Avoid duplicate impact reports for the exact same rule_id
  const existing = state.impact_reports.find((ir) => ir.rule_id === newRule.id);
  if (existing) return existing;

  const citation = buildCitation(newRule);
  const items: ImpactItem[] = [];
  const reportId = `ir-${newRule.id}-${Date.now().toString(36)}`;

  if (links.length === 0) {
    // Generic fallback impact link so newly uploaded rules also show traceability
    items.push({
      id: `ii-${reportId}-0`,
      impact_report_id: reportId,
      rule_id: newRule.id,
      rule_key: newRule.rule_key,
      linked_type: 'eligibility',
      linked_id: `elig-${newRule.rule_key}`,
      target_title: `Scheme Guidance & Rules Registry (${newRule.label})`,
      old_text: oldRule ? oldRule.condition_text : 'Not previously required',
      proposed_text: newRule.condition_text,
      reason: 'Approved rule update must reflect in JanSetu guidance and FormSathi checks.',
      source_citation: citation,
      status: 'proposed',
    });
  } else {
    links.forEach((lnk, idx) => {
      let oldText = oldRule ? formatRuleDisplay(oldRule) : 'Not in prior version';
      let proposedText = formatRuleDisplay(newRule);
      let reason = 'Linked downstream process depends on this rule.';

      if (lnk.linked_type === 'eligibility') {
        oldText = oldRule ? oldRule.condition_text : 'No prior condition';
        proposedText = newRule.condition_text;
        reason = 'Direct eligibility threshold update for Scheme Eligibility Finder & What-If.';
      } else if (lnk.linked_type === 'procedure_step') {
        const step = state.procedure_steps.find((s) => s.id === lnk.linked_id);
        oldText = step ? step.description : 'Existing procedure guidance';
        proposedText =
          newRule.rule_key === 'income'
            ? `Ensure your valid revenue Income Certificate shows total family annual income ≤ ${formatInr(newRule.value)}.`
            : newRule.rule_key === 'd-enrol'
            ? 'Scan clear copies of Income certificate, Marksheet, Bank passbook copy, and Enrolment certificate.'
            : newRule.condition_text;
        reason = 'Citizen step-by-step procedure instructions reference this threshold/document.';
      } else if (lnk.linked_type === 'required_document') {
        const reqDoc = state.required_documents.find((d) => d.id === lnk.linked_id);
        oldText = reqDoc && !reqDoc.active ? 'Inactive / Not required in v1' : 'Optional';
        proposedText = `Activate "${newRule.value}" in mandatory FormSathi & checklist requirements.`;
        reason = 'Document checklist must reflect newly added mandatory certificate.';
      } else if (lnk.linked_type === 'application_check') {
        oldText = oldRule ? `Validate against ${formatRuleDisplay(oldRule)}` : 'Check not active';
        proposedText = `Update FormSathi automated validation rule to ${formatRuleDisplay(newRule)}.`;
        reason = 'Pre-submission validation engine relies on active rule constraints.';
      } else if (lnk.linked_type === 'deadline') {
        const dl = state.deadlines.find((d) => d.id === lnk.linked_id);
        oldText = dl ? `Due ${formatDateReadable(dl.due_date)}` : '30 Sep 2026';
        proposedText = `Update deadline tracker due date to ${formatDateReadable(String(newRule.value))}.`;
        reason = 'Applicant deadline reminders must shift to the amended submission date.';
      } else if (lnk.linked_type === 'alerts') {
        oldText = 'No notification dispatched';
        proposedText = `Broadcast citizen & admin alert: ${newRule.condition_text}`;
        reason = 'Applicants affected by threshold/deadline changes should be notified.';
      }

      items.push({
        id: `ii-${reportId}-${idx}`,
        impact_report_id: reportId,
        rule_id: newRule.id,
        rule_key: newRule.rule_key,
        linked_type: lnk.linked_type,
        linked_id: lnk.linked_id,
        target_title: lnk.dependency_label,
        old_text: oldText,
        proposed_text: proposedText,
        reason,
        source_citation: citation,
        status: 'proposed',
      });
    });
  }

  const ruleChange = state.rule_changes.find((rc) => rc.new_rule_id === newRule.id);

  const report: ImpactReport = {
    id: reportId,
    rule_change_id: ruleChange ? ruleChange.id : `rc-${newRule.id}`,
    rule_id: newRule.id,
    scheme_id: newRule.scheme_id,
    title: `${newRule.label} → ${formatRuleDisplay(newRule)}`,
    generated_at: new Date().toISOString(),
    status: 'pending_review',
    items,
  };

  state.impact_reports.unshift(report);
  return report;
}

export function reviewRuleDecision(params: {
  ruleId: string;
  decision: 'approved' | 'rejected' | 'correction_requested';
  note: string;
  actor: { id: string; name: string; role: UserRole };
}): { rule: RuleRecord; impactReport: ImpactReport | null } {
  const state = db.getState();
  const rule = state.rules.find((r) => r.id === params.ruleId);
  if (!rule) {
    throw new Error(`Rule ${params.ruleId} not found.`);
  }

  const citation = buildCitation(rule);
  let impactReport: ImpactReport | null = null;

  if (params.decision === 'approved') {
    const previousActive =
      state.rules.find(
        (r) =>
          r.id !== rule.id &&
          r.scheme_id === rule.scheme_id &&
          r.rule_key === rule.rule_key &&
          r.status === 'active'
      ) || null;

    if (previousActive) {
      previousActive.status = 'superseded';
      previousActive.valid_to = rule.valid_from;
    }

    rule.status = 'active';

    const rc = state.rule_changes.find((c) => c.new_rule_id === rule.id);
    if (rc) rc.review_status = 'approved';

    impactReport = createImpactReportForRuleChange(rule, previousActive);

    appendAuditLog({
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'Rule approved & activated',
      objectType: 'rule',
      objectId: rule.id,
      sourceReference: citation,
      details: `${rule.label} set to ${formatRuleDisplay(rule)}. ${
        previousActive ? `Superseded ${previousActive.id}.` : ''
      } ${params.note ? `Note: ${params.note}` : ''}`.trim(),
    });
  } else if (params.decision === 'correction_requested') {
    if (!params.note.trim()) {
      throw new Error('A correction note is required when requesting corrections.');
    }
    rule.status = 'correction_requested';
    const rc = state.rule_changes.find((c) => c.new_rule_id === rule.id);
    if (rc) rc.review_status = 'pending';

    appendAuditLog({
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'Rule correction requested',
      objectType: 'rule',
      objectId: rule.id,
      sourceReference: citation,
      details: `${rule.label} flagged for revision: ${params.note}`,
    });
  } else {
    rule.status = 'rejected';
    const rc = state.rule_changes.find((c) => c.new_rule_id === rule.id);
    if (rc) rc.review_status = 'rejected';

    appendAuditLog({
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'Rule rejected',
      objectType: 'rule',
      objectId: rule.id,
      sourceReference: citation,
      details: `${rule.label} (${formatRuleDisplay(rule)}) rejected. ${
        params.note ? `Reason: ${params.note}` : ''
      }`.trim(),
    });
  }

  const queueItem = state.review_queue.find((q) => q.item_id === rule.id);
  if (queueItem) {
    queueItem.status = params.decision;
    queueItem.decision_note = params.note;
    queueItem.reviewed_by = params.actor.name;
    queueItem.reviewed_at = new Date().toISOString();
  }

  // Update document verification status if no draft rules remain for that document
  const doc = state.documents.find((d) => d.id === rule.document_id);
  if (doc) {
    const remainingDrafts = state.rules.filter(
      (r) => r.document_id === doc.id && r.status === 'draft'
    );
    if (remainingDrafts.length === 0) {
      doc.verification_status = 'verified';
    }
  }

  db.save();
  return { rule, impactReport };
}

export function applyImpactReportItem(params: {
  reportId: string;
  itemId: string;
  action: 'apply' | 'reject';
  actor: { id: string; name: string; role: UserRole };
}): ImpactReport {
  const state = db.getState();
  const report = state.impact_reports.find((r) => r.id === params.reportId);
  if (!report) throw new Error('Impact report not found.');

  const item = report.items.find((i) => i.id === params.itemId);
  if (!item) throw new Error('Impact item not found.');

  const rule = state.rules.find((r) => r.id === item.rule_id);
  if (!rule || rule.status !== 'active') {
    throw new Error('Cannot apply impact update before its source rule is approved and active.');
  }

  if (params.action === 'reject') {
    item.status = 'rejected';
    appendAuditLog({
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'Ripple impact rejected',
      objectType: 'impact_item',
      objectId: item.id,
      sourceReference: item.source_citation,
      details: `Skipped update for ${item.target_title}`,
    });
  } else {
    // Propagate actual database updates for connected modules!
    if (item.linked_type === 'procedure_step') {
      const step = state.procedure_steps.find((s) => s.id === item.linked_id);
      if (step) {
        step.description = item.proposed_text;
        if (rule.rule_key === 'income') {
          step.title = `Check family income against ${formatInr(rule.value)} limit`;
          step.title_te = `కుటుంబ ఆదాయాన్ని ${formatInr(rule.value)} పరిమితితో సరిపోల్చండి`;
          step.description_te = `మీ రెవెన్యూ ఆదాయ ధృవీకరణ పత్రంలో కుటుంబ వార్షిక ఆదాయం ≤ ${formatInr(
            rule.value
          )} ఉందని నిర్ధారించుకోండి.`;
        } else if (rule.rule_key === 'd-enrol') {
          step.description_te =
            'ఆదాయ ధృవీకరణ పత్రం, మార్కుల జాబితా, బ్యాంక్ పాస్‌బుక్ కాపీ మరియు నమోదు ధృవీకరణ పత్రాన్ని సిద్ధం చేయండి.';
        }
      }
    } else if (item.linked_type === 'required_document') {
      const reqDoc = state.required_documents.find((d) => d.id === item.linked_id);
      if (reqDoc) {
        reqDoc.active = true;
        reqDoc.description = `Mandatory per ${item.source_citation}.`;
      } else {
        state.required_documents.push({
          id: item.linked_id,
          scheme_id: rule.scheme_id,
          name: String(rule.value),
          name_te: rule.label_te,
          description: rule.condition_text,
          linked_rule_key: rule.rule_key,
          active: true,
        });
      }
    } else if (item.linked_type === 'deadline') {
      const dl = state.deadlines.find((d) => d.id === item.linked_id);
      if (dl) {
        dl.due_date = String(rule.value);
        dl.needs_ripple_review = false;
        dl.status = 'pending';
      }
      const step4 = state.procedure_steps.find(
        (s) => s.scheme_id === rule.scheme_id && s.linked_rule_key === 'deadline'
      );
      if (step4) {
        step4.description = `Validate document readiness before submitting on the official portal by ${formatDateReadable(
          String(rule.value)
        )}.`;
        step4.description_te = `${formatDateReadable(
          String(rule.value)
        )} లోపు అధికారిక పోర్టల్‌లో సమర్పించే ముందు పత్రాల సిద్ధతను తనిఖీ చేయండి.`;
      }
    } else if (item.linked_type === 'alerts') {
      state.alerts.unshift({
        id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        target_role: 'ALL',
        scheme_id: rule.scheme_id,
        rule_change_id: report.rule_change_id,
        priority: 'high',
        message: `Verified rule update (${item.source_citation}): ${rule.condition_text}`,
        message_te: `ధృవీకరించబడిన నియమ మార్పు (${item.source_citation}): ${rule.condition_text_te}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    }

    item.status = 'applied';
    appendAuditLog({
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'Ripple impact applied',
      objectType: item.linked_type,
      objectId: item.linked_id,
      sourceReference: item.source_citation,
      details: `Updated ${item.target_title}: ${item.proposed_text}`,
    });
  }

  const allDone = report.items.every((i) => i.status === 'applied' || i.status === 'rejected');
  const anyApplied = report.items.some((i) => i.status === 'applied');
  report.status = allDone ? 'applied' : anyApplied ? 'partially_applied' : 'pending_review';

  db.save();
  return report;
}

export function evaluateNumericCondition(
  provided: number | null | undefined,
  operator: RuleRecord['operator'],
  limit: number | string
): 'met' | 'not_met' | 'missing_info' {
  if (provided === null || provided === undefined || Number.isNaN(Number(provided))) {
    return 'missing_info';
  }
  const val = Number(provided);
  const target = Number(limit);
  if (Number.isNaN(target)) return 'missing_info';
  if (operator === '<=') return val <= target ? 'met' : 'not_met';
  if (operator === '>=') return val >= target ? 'met' : 'not_met';
  if (operator === '=') return val === target ? 'met' : 'not_met';
  return 'missing_info';
}

export function evaluateAllSchemesEligibility(params: {
  family_income: number | null;
  marks_percent: number | null;
}): EligibilityEvaluationResult[] {
  const state = db.getState();

  return state.schemes
    .filter((s) => s.active)
    .map((scheme) => {
      const activeEligibilityRules = getActiveRulesForScheme(scheme.id).filter(
        (r) => r.rule_type === 'eligibility'
      );

      const conditions = activeEligibilityRules.map((rule) => {
        let providedVal: number | null = null;
        let providedLabel = 'Not provided';
        if (rule.field === 'family_income') {
          providedVal = params.family_income;
          providedLabel =
            params.family_income !== null ? formatInr(params.family_income) : 'Not provided';
        } else if (rule.field === 'marks_percent') {
          providedVal = params.marks_percent;
          providedLabel =
            params.marks_percent !== null ? `${params.marks_percent}%` : 'Not provided';
        }

        const outcome = evaluateNumericCondition(providedVal, rule.operator, rule.value);
        return {
          rule_id: rule.id,
          label: rule.label,
          expected: formatRuleDisplay(rule),
          provided: providedLabel,
          outcome,
          citation: buildCitation(rule),
        };
      });

      const hasNotMet = conditions.some((c) => c.outcome === 'not_met');
      const hasMissing = conditions.some((c) => c.outcome === 'missing_info');

      const status: EligibilityEvaluationResult['status'] = hasNotMet
        ? 'not_eligible'
        : hasMissing
        ? 'possibly_eligible'
        : 'likely_eligible';

      return {
        scheme,
        status,
        conditions,
      };
    });
}

export function runWhatIfSimulation(params: {
  schemeId: string;
  family_income: number | null;
  marks_percent: number | null;
}): WhatIfResult {
  const state = db.getState();
  const schemeRules = state.rules.filter(
    (r) => r.scheme_id === params.schemeId && r.rule_type === 'eligibility'
  );
  const keys = Array.from(new Set(schemeRules.map((r) => r.rule_key)));

  const rows = keys.flatMap((key) => {
    const v1 =
      schemeRules.find((r) => r.rule_key === key && r.version === 1) ||
      schemeRules.filter((r) => r.rule_key === key).sort((a, b) => a.version - b.version)[0];
    const v2 =
      schemeRules
        .filter((r) => r.rule_key === key && r.version >= 2)
        .sort((a, b) => b.version - a.version)[0] || v1;

    if (!v1 || !v2) return [];

    const inputVal = key === 'income' ? params.family_income : params.marks_percent;
    const o1 = evaluateNumericCondition(inputVal, v1.operator, v1.value);
    const o2 = evaluateNumericCondition(inputVal, v2.operator, v2.value);

    return [{
      rule_key: key,
      label: v1.label,
      v1_display: formatRuleDisplay(v1),
      v1_outcome: (o1 === 'missing_info' ? 'cannot_determine' : o1) as
        | 'met'
        | 'not_met'
        | 'cannot_determine',
      v2_display: formatRuleDisplay(v2),
      v2_outcome: (o2 === 'missing_info' ? 'cannot_determine' : o2) as
        | 'met'
        | 'not_met'
        | 'cannot_determine',
      v2_status: v2.status,
    }];
  });

  const v1_eligible = rows.length > 0 && rows.every((r) => r.v1_outcome === 'met');
  const v2_eligible = rows.length > 0 && rows.every((r) => r.v2_outcome === 'met');
  const outcome_changed = v1_eligible !== v2_eligible;

  const changedCond = rows.find((r) => r.v1_outcome !== r.v2_outcome);
  const explanation = outcome_changed
    ? `Outcome flips from ${v1_eligible ? 'Eligible' : 'Not Eligible'} (v1) to ${
        v2_eligible ? 'Eligible' : 'Not Eligible'
      } (v2) because "${changedCond?.label}" changed from ${changedCond?.v1_display} to ${
        changedCond?.v2_display
      }.`
    : v1_eligible
    ? 'Applicant satisfies all eligibility thresholds under both versions.'
    : 'Applicant does not satisfy all thresholds under either version with the entered values.';

  return {
    scheme_id: params.schemeId,
    rows,
    v1_eligible,
    v2_eligible,
    outcome_changed,
    explanation,
  };
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function runFormSathiReadinessCheck(params: {
  userId: string;
  userName: string;
  userRole: UserRole;
  schemeId: string;
  uploadedDocuments: string[];
  family_income: number | null;
  marks_percent: number | null;
  name_on_income_cert: string;
  name_on_marksheet: string;
}): ReadinessReport {
  const state = db.getState();
  const activeRules = getActiveRulesForScheme(params.schemeId);
  const requiredDocRules = activeRules.filter((r) => r.rule_type === 'required_document');
  const incomeRule = activeRules.find((r) => r.field === 'family_income');
  const marksRule = activeRules.find((r) => r.field === 'marks_percent');

  const completed: ReadinessCheckItem[] = [];
  const missing: ReadinessCheckItem[] = [];
  const uncertain: ReadinessCheckItem[] = [];

  // 1. Check required documents (and active required_documents synced by Policy Ripple)
  const docChecklist = state.required_documents.filter(
    (d) => d.scheme_id === params.schemeId && d.active
  );
  const effectiveDocNames =
    docChecklist.length > 0
      ? docChecklist.map((d) => ({
          name: d.name,
          rule: requiredDocRules.find((r) => r.rule_key === d.linked_rule_key),
        }))
      : requiredDocRules.map((r) => ({ name: String(r.value), rule: r }));

  for (const docReq of effectiveDocNames) {
    const citation = docReq.rule ? buildCitation(docReq.rule) : 'Verified scheme checklist';
    const hasDoc = params.uploadedDocuments.some(
      (u) => u.trim().toLowerCase() === docReq.name.trim().toLowerCase()
    );
    if (hasDoc) {
      completed.push({
        item: `${docReq.name} uploaded`,
        reason: 'Document selected in synthetic application packet.',
        why_it_matters: 'Mandatory supporting proof required for verification.',
        citation,
      });
    } else {
      missing.push({
        item: `Missing: ${docReq.name}`,
        reason: 'Required document has not been attached yet.',
        why_it_matters: 'Applications without mandatory certificates are returned incomplete.',
        citation,
      });
    }
  }

  // 2. Deterministic Income check
  if (incomeRule) {
    const res = evaluateNumericCondition(
      params.family_income,
      incomeRule.operator,
      incomeRule.value
    );
    const citation = buildCitation(incomeRule);
    if (res === 'met') {
      completed.push({
        item: `Family income ${formatInr(params.family_income!)} within ${formatInr(
          incomeRule.value
        )} limit`,
        reason: `Verified deterministically against active income rule (${formatRuleDisplay(
          incomeRule
        )}).`,
        why_it_matters: 'Income ceiling determines means-based eligibility.',
        citation,
      });
    } else if (res === 'not_met') {
      missing.push({
        item: `Family income ${formatInr(params.family_income!)} exceeds ${formatInr(
          incomeRule.value
        )} ceiling`,
        reason: `Entered family income is above the current approved limit of ${formatInr(
          incomeRule.value
        )}.`,
        why_it_matters: 'Exceeding the active income threshold causes automatic disqualification.',
        citation,
      });
    } else {
      uncertain.push({
        item: 'Family annual income not entered',
        reason: 'No income figure provided for threshold verification.',
        why_it_matters: 'Cannot verify means criteria without the certificate amount.',
        citation,
      });
    }
  }

  // 3. Deterministic Marks check
  if (marksRule) {
    const res = evaluateNumericCondition(
      params.marks_percent,
      marksRule.operator,
      marksRule.value
    );
    const citation = buildCitation(marksRule);
    if (res === 'met') {
      completed.push({
        item: `Qualifying marks ${params.marks_percent}% meet ${marksRule.value}% minimum`,
        reason: 'Deterministic check passed against active academic cutoff.',
        why_it_matters: 'Merit cutoff is checked before application forwarding.',
        citation,
      });
    } else if (res === 'not_met') {
      missing.push({
        item: `Qualifying marks ${params.marks_percent}% below ${marksRule.value}% minimum`,
        reason: `Score is below the required ${marksRule.value}% aggregate.`,
        why_it_matters: 'Applicants below minimum marks do not qualify.',
        citation,
      });
    } else {
      uncertain.push({
        item: 'Qualifying marks percentage not entered',
        reason: 'No marks percentage provided.',
        why_it_matters: 'Cannot verify academic merit threshold.',
        citation,
      });
    }
  }

  // 4. Cross-document consistency check (Name mismatch)
  if (!params.name_on_income_cert.trim() || !params.name_on_marksheet.trim()) {
    uncertain.push({
      item: 'Cross-document name comparison incomplete',
      reason: 'Enter applicant name as printed on both Income Certificate and Marksheet.',
      why_it_matters: 'Name discrepancies across certificates frequently delay verification.',
      citation: 'FormSathi Consistency Check · Cross-Document Verification',
    });
  } else if (
    normalizeName(params.name_on_income_cert) !== normalizeName(params.name_on_marksheet)
  ) {
    uncertain.push({
      item: `Name mismatch: "${params.name_on_income_cert}" vs "${params.name_on_marksheet}"`,
      reason:
        'Applicant name differs between the Income Certificate and the qualifying Marksheet.',
      why_it_matters:
        'Portals or institutional officers often flag differing initials or spellings for manual clarification.',
      citation: 'FormSathi Consistency Check · Cross-Document Verification',
    });
  } else {
    completed.push({
      item: `Applicant name "${params.name_on_income_cert}" matches across documents`,
      reason: 'Normalized names on Income Certificate and Marksheet match.',
      why_it_matters: 'Consistent identity reduces verification rejections.',
      citation: 'FormSathi Consistency Check · Cross-Document Verification',
    });
  }

  const report: ReadinessReport = {
    id: `rr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: params.userId,
    scheme_id: params.schemeId,
    applicant_label: params.name_on_income_cert.trim() || 'Sample Applicant',
    generated_at: new Date().toISOString(),
    completed,
    missing,
    uncertain,
    disclaimer:
      'Based on the verified requirements available in the system, this report highlights readiness checks only. It does not guarantee acceptance; final approval rests with the issuing authority.',
  };

  state.readiness_reports.unshift(report);
  appendAuditLog({
    actorId: params.userId,
    actorName: params.userName,
    actorRole: params.userRole,
    action: 'FormSathi readiness check run',
    objectType: 'readiness_report',
    objectId: report.id,
    sourceReference: `${params.schemeId} active rules`,
    details: `${completed.length} completed, ${missing.length} missing, ${uncertain.length} uncertain.`,
  });

  db.save();
  return report;
}

const QUERY_STOPWORDS = new Set([
  'what',
  'which',
  'when',
  'where',
  'whom',
  'whose',
  'how',
  'does',
  'have',
  'will',
  'with',
  'from',
  'that',
  'this',
  'there',
  'their',
  'about',
  'need',
  'needed',
  'required',
  'apply',
  'india',
  'indian',
  'please',
  'tell',
  'give',
  'details',
  'rules',
  'rule',
  'can',
  'are',
  'for',
  'the',
  'and',
]);

export function retrieveApprovedRulesForQuery(question: string, strict = false): RuleRecord[] {
  const q = question.toLowerCase();
  const state = db.getState();
  const active = state.rules.filter((r) => r.status === 'active');

  const terms = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 3 && !QUERY_STOPWORDS.has(w));

  if (terms.length === 0) {
    return strict ? [] : active;
  }

  const scored = active
    .map((r) => {
      const scheme = state.schemes.find((s) => s.id === r.scheme_id);
      const hay = `${scheme?.code || ''} ${scheme?.name || ''} ${r.label} ${r.condition_text} ${r.condition_text_te} ${r.rule_key} ${r.rule_type}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (hay.includes(t)) score += 1;
      }
      return { rule: r, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored.slice(0, 12).map((entry) => entry.rule);
  }

  return strict ? [] : active;
}

export function formatCitationLanguage(rule: RuleRecord, lang: LanguageCode): string {
  return lang === 'te' ? rule.condition_text_te : rule.condition_text;
}

export function buildAllSchemesPredefinedAnalysis(params: {
  userProfile: {
    name?: string;
    address?: string;
    district?: string;
    state?: string;
    family_income?: number | null;
    marks_percent?: number | null;
  };
  memorizedDocs: Array<{
    doc_type: string;
    title: string;
    scheme_id: string;
    extracted_name: string;
    extracted_income: number | null;
    extracted_marks: number | null;
    extracted_address: string;
  }>;
}): {
  effective_income: number | null;
  effective_marks: number | null;
  scheme_tasks: Array<{
    scheme_id: string;
    scheme_code: string;
    scheme_name: string;
    is_new: boolean;
    target_group: string;
    eligibility_status: 'likely_eligible' | 'possibly_eligible' | 'not_eligible';
    benefit_summary: string;
    matched_docs: string[];
    missing_docs: string[];
    predefined_tasks: string[];
    advanced_tasks: string[];
  }>;
} {
  const state = db.getState();

  const docIncome = params.memorizedDocs.find(
    (d) => typeof d.extracted_income === 'number' && !Number.isNaN(d.extracted_income)
  )?.extracted_income;
  const docMarks = params.memorizedDocs.find(
    (d) => typeof d.extracted_marks === 'number' && !Number.isNaN(d.extracted_marks)
  )?.extracted_marks;

  const effective_income =
    typeof params.userProfile.family_income === 'number' &&
    !Number.isNaN(params.userProfile.family_income)
      ? params.userProfile.family_income
      : docIncome ?? null;

  const effective_marks =
    typeof params.userProfile.marks_percent === 'number' &&
    !Number.isNaN(params.userProfile.marks_percent)
      ? params.userProfile.marks_percent
      : docMarks ?? null;

  const evaluations = evaluateAllSchemesEligibility({
    family_income: effective_income,
    marks_percent: effective_marks,
  });

  const docNamesAcrossVault = Array.from(
    new Set(
      params.memorizedDocs
        .map((d) => d.extracted_name.trim())
        .filter(Boolean)
    )
  );
  const hasNameDiscrepancy =
    docNamesAcrossVault.length > 1 ||
    (params.userProfile.name &&
      docNamesAcrossVault.some(
        (n) => normalizeName(n) !== normalizeName(params.userProfile.name!)
      ));

  const missingAddress = !params.userProfile.address || !params.userProfile.address.trim();

  const scheme_tasks = evaluations.map((ev) => {
    const reqDocs = state.required_documents.filter(
      (d) => d.scheme_id === ev.scheme.id && d.active
    );
    const activeRules = getActiveRulesForScheme(ev.scheme.id);
    const fallbackDocRules =
      reqDocs.length > 0
        ? reqDocs.map((d) => d.name)
        : activeRules
            .filter((r) => r.rule_type === 'required_document')
            .map((r) => String(r.value));

    const matched_docs: string[] = [];
    const missing_docs: string[] = [];

    for (const reqName of fallbackDocRules) {
      const reqLow = reqName.toLowerCase();
      const matched = params.memorizedDocs.some((ud) => {
        const scopeMatch = ud.scheme_id === 'ALL' || ud.scheme_id === ev.scheme.id;
        if (!scopeMatch) return false;
        const typeLow = ud.doc_type.toLowerCase();
        const titleLow = ud.title.toLowerCase();
        return (
          typeLow === reqLow ||
          typeLow.includes(reqLow) ||
          reqLow.includes(typeLow) ||
          titleLow.includes(reqLow.split(' ')[0])
        );
      });
      if (matched) matched_docs.push(reqName);
      else missing_docs.push(reqName);
    }

    const nearestDeadline = state.deadlines
      .filter((dl) => dl.scheme_id === ev.scheme.id && dl.status !== 'completed')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

    const predefined_tasks: string[] = [];

    if (ev.status === 'not_eligible') {
      const failed = ev.conditions
        .filter((c) => c.outcome === 'not_met')
        .map((c) => `${c.label} (needs ${c.expected}, profile has ${c.provided})`);
      predefined_tasks.push(
        `Threshold gap: ${failed.join('; ') || 'Criteria not met under active v1/v2 rules'}. Check What-If simulator for pending RuleWeaver amendments.`
      );
    } else if (ev.status === 'possibly_eligible') {
      predefined_tasks.push(
        'Save your Family Annual Income and Qualifying Marks % in Profile & Document Vault to confirm eligibility.'
      );
    } else {
      predefined_tasks.push(
        `Eligibility thresholds verified (${ev.conditions.map((c) => `${c.label}: ${c.provided}`).join(', ')}).`
      );
    }

    if (missing_docs.length > 0) {
      predefined_tasks.push(
        `Upload or memorize ${missing_docs.length} missing document(s) to Vault: ${missing_docs.join(', ')}.`
      );
    } else if (matched_docs.length > 0) {
      predefined_tasks.push(
        `All ${matched_docs.length} required document(s) already memorized in Vault and ready for FormSathi packet.`
      );
    }

    if (hasNameDiscrepancy) {
      predefined_tasks.push(
        `Verify consistent applicant spelling across memorized certificates (${docNamesAcrossVault.join(' vs ')}).`
      );
    }

    if (missingAddress) {
      predefined_tasks.push(
        'Add your residential address and district in Profile Vault for domicile & help-center mapping.'
      );
    }

    if (nearestDeadline) {
      predefined_tasks.push(
        `Target submission deadline: ${formatDateReadable(nearestDeadline.due_date)} (${nearestDeadline.title}).`
      );
    }

    const advanced_tasks: string[] = [];
    if (ev.status === 'likely_eligible' && missing_docs.length === 0) {
      advanced_tasks.push(
        `Fast-track ${ev.scheme.code}: Auto-reuse ${matched_docs.length} memorized Vault certificate(s) in FormSathi Readiness Check before ${
          nearestDeadline ? formatDateReadable(nearestDeadline.due_date) : 'cycle close'
        }.`
      );
    } else if (ev.status === 'likely_eligible' && missing_docs.length > 0) {
      advanced_tasks.push(
        `High-ROI Unlock: Securing ${missing_docs[0]} unlocks ${ev.scheme.benefit_summary}.`
      );
    } else {
      advanced_tasks.push(
        `Monitor RuleWeaver v2 amendments or upload updated certificates if household income/academic criteria shift.`
      );
    }

    return {
      scheme_id: ev.scheme.id,
      scheme_code: ev.scheme.code,
      scheme_name: ev.scheme.name,
      is_new: Boolean(ev.scheme.is_new),
      target_group: ev.scheme.target_group || 'General Welfare',
      eligibility_status: ev.status,
      benefit_summary: ev.scheme.benefit_summary,
      matched_docs,
      missing_docs,
      predefined_tasks,
      advanced_tasks,
    };
  });

  return {
    effective_income,
    effective_marks,
    scheme_tasks,
  };
}

export function buildDeveloperOverview() {
  const state = db.getState();
  const totalRules = state.rules.length;
  const avgConfidence =
    totalRules > 0
      ? Number(
          (
            state.rules.reduce((sum, r) => sum + (Number(r.confidence) || 0), 0) / totalRules
          ).toFixed(3)
        )
      : 0;

  const scheme_schemas = state.schemes.map((s) => {
    const sRules = state.rules.filter((r) => r.scheme_id === s.id);
    const reqDocs = state.required_documents
      .filter((d) => d.scheme_id === s.id && d.active)
      .map((d) => d.name);
    const fields = Array.from(new Set(sRules.map((r) => r.field)));
    return {
      scheme_id: s.id,
      code: s.code,
      name: s.name,
      schema_version: s.schema_version || '1.0',
      introduced_date: s.introduced_date || '2026-07-01',
      is_new: Boolean(s.is_new),
      target_group: s.target_group || 'General Welfare',
      eligibility_fields: fields,
      required_documents: reqDocs,
      active_rules_count: sRules.filter((r) => r.status === 'active').length,
      draft_rules_count: sRules.filter((r) => r.status === 'draft').length,
    };
  });

  return {
    api_version: 'v4.2-niyamsetu',
    schema_count: state.schemes.length,
    new_schemas_count: state.schemes.filter((s) => s.is_new).length,
    total_rules_ast: totalRules,
    avg_extraction_confidence: avgConfidence,
    firestore_collections: [
      { path: '/users/{userId}', isolation_model: 'Owner UID + Verified Email', required_fields: 7 },
      { path: '/user_documents/{docId}', isolation_model: 'Strict ownerId == auth.uid', required_fields: 8 },
      { path: '/saved_bookmarks/{bookmarkId}', isolation_model: 'Strict ownerId == auth.uid', required_fields: 8 },
      { path: '/readiness_checks/{checkId}', isolation_model: 'Strict ownerId == auth.uid', required_fields: 10 },
      { path: '/schemes_catalog/{schemeId}', isolation_model: 'Public active == true / Admin Write', required_fields: 9 },
      { path: '/admins/{userId}', isolation_model: 'Admin Registry Gate', required_fields: 3 },
    ],
    api_endpoints: [
      { method: 'GET' as const, path: '/api/profile', auth: 'Bearer JWT', purpose: 'Fetch authenticated user profile & address' },
      { method: 'PUT' as const, path: '/api/profile', auth: 'Bearer JWT', purpose: 'Persist personal details, address, income & marks' },
      { method: 'GET' as const, path: '/api/user-documents', auth: 'Bearer JWT', purpose: 'List memorized Vault documents scoped to user' },
      { method: 'POST' as const, path: '/api/user-documents', auth: 'Bearer JWT', purpose: 'Memorize extracted or entered document across activities' },
      { method: 'GET' as const, path: '/api/eligibility/vault-summary', auth: 'Bearer JWT', purpose: 'Deterministic all-16-scheme evaluation + predefined tasks' },
      { method: 'POST' as const, path: '/api/eligibility/ai-plan', auth: 'Bearer JWT', purpose: 'Gemini 4 Hydrogen all-16-scheme strategy & advanced tasks' },
      { method: 'POST' as const, path: '/api/formsathi/extract-file', auth: 'Bearer JWT', purpose: 'Extract fields & optionally memorize document to Vault' },
      { method: 'GET' as const, path: '/api/developer/overview', auth: 'DEVELOPER / PLATFORM_ADMIN', purpose: 'Live JSON scheme schemas, rule AST counts & Firestore telemetry' },
    ],
    scheme_schemas,
  };
}

export function computeSchemeAndRuleAnalytics(): {
  scheme_usage: SchemeUsageStat[];
  rule_usefulness: RuleUsefulnessStat[];
} {
  const state = db.getState();
  const schemeById = new Map(state.schemes.map((s) => [s.id, s]));
  const citizens = state.users.filter((u) => u.role === 'STUDENT');

  const scheme_usage: SchemeUsageStat[] = state.schemes
    .map((s) => {
      const apps = state.applications.filter((a) => a.scheme_id === s.id);
      const confirmed = apps.filter((a) => a.status === 'submitted_confirmed').length;
      const checks = state.readiness_reports.filter((r) => r.scheme_id === s.id).length;
      const docs = state.user_documents.filter(
        (d) => d.scheme_id === s.id || d.scheme_id === 'ALL'
      ).length;
      const activeRules = state.rules.filter(
        (r) => r.scheme_id === s.id && r.status === 'active'
      ).length;

      const total_usage_score = apps.length * 10 + confirmed * 8 + checks * 6 + docs * 2;
      return {
        scheme_id: s.id,
        scheme_code: s.code,
        scheme_name: s.name,
        target_group: s.target_group || 'General Welfare',
        applications_count: apps.length,
        confirmed_count: confirmed,
        readiness_checks_count: checks,
        memorized_docs_count: docs,
        active_rules_count: activeRules,
        total_usage_score,
      };
    })
    .sort((a, b) => b.total_usage_score - a.total_usage_score);

  const rule_usefulness: RuleUsefulnessStat[] = state.rules
    .filter((r) => r.status === 'active')
    .map((rule) => {
      const scheme = schemeById.get(rule.scheme_id);
      const schemeApps = state.applications.filter((a) => a.scheme_id === rule.scheme_id).length;
      const schemeChecks = state.readiness_reports.filter(
        (rr) => rr.scheme_id === rule.scheme_id
      ).length;
      const linkedDeps = state.rule_links.filter(
        (l) => l.scheme_id === rule.scheme_id && l.rule_key === rule.rule_key
      ).length;

      let met_count = 0;
      let not_met_count = 0;
      let missing_count = 0;

      for (const citizen of citizens) {
        if (rule.field === 'family_income') {
          const outcome = evaluateNumericCondition(citizen.family_income, rule.operator, rule.value);
          if (outcome === 'met') met_count++;
          else if (outcome === 'not_met') not_met_count++;
          else missing_count++;
        } else if (rule.field === 'marks_percent') {
          const outcome = evaluateNumericCondition(citizen.marks_percent, rule.operator, rule.value);
          if (outcome === 'met') met_count++;
          else if (outcome === 'not_met') not_met_count++;
          else missing_count++;
        } else if (rule.rule_type === 'required_document') {
          const docName = String(rule.value).toLowerCase();
          const hasDoc = state.user_documents.some(
            (ud) =>
              ud.user_id === citizen.id &&
              (ud.doc_type.toLowerCase().includes(docName.split(' ')[0]) ||
                docName.includes(ud.doc_type.toLowerCase()))
          );
          if (hasDoc) met_count++;
          else missing_count++;
        } else {
          met_count++;
        }
      }

      const evaluations_triggered =
        citizens.length + schemeApps * 2 + schemeChecks * 2;
      const decisiveOutcomes = met_count + not_met_count;
      const usefulness_score = Math.min(
        100,
        Math.round(
          linkedDeps * 12 +
            evaluations_triggered * 2.5 +
            decisiveOutcomes * 6 +
            (Number(rule.confidence) || 0.9) * 20
        )
      );

      return {
        rule_id: rule.id,
        scheme_id: rule.scheme_id,
        scheme_code: scheme?.code || rule.scheme_id,
        rule_key: rule.rule_key,
        label: rule.label,
        rule_type: rule.rule_type,
        version: rule.version,
        citation: buildCitation(rule),
        evaluations_triggered,
        met_count,
        not_met_count,
        missing_count,
        linked_dependencies_count: linkedDeps,
        confidence: Number(rule.confidence) || 0.9,
        usefulness_score,
      };
    })
    .sort((a, b) => b.usefulness_score - a.usefulness_score);

  return { scheme_usage, rule_usefulness };
}

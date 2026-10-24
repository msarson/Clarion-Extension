import * as assert from 'assert';
import { PROJECT_PROPERTY_FIELDS, PROJECT_PROPERTY_TABS, fieldAvailability, targetsProperties } from '../project/ProjectPropertyFields';

/**
 * #792 — the fields of the Project Properties page: the Clarion IDE's four pages, each field the
 * .cwproj property it writes. A field the build only understands from Clarion 12 on (dep,
 * dynamic_base: read by Clarion 12's SoftVelocity.Build.Clarion.targets, not Clarion 10's) is
 * offered only when the chosen installation's targets read it.
 */
const C10_TARGETS = '<Exec Command="... $(OutputType) $(Model) $(DefineConstants) $(vid) $(check_index) $(check_stack) $(stack_size) $(CopyCore) $(GenerateMap) $(line_numbers) $(warnings) $(OutputName) $(OutputPath) $(ApplicationIcon) $(PreBuildEvent) $(PostBuildEvent) $(RunPostBuildEvent)" />';
const C12_TARGETS = C10_TARGETS.replace('$(warnings)', '$(warnings) $(dep) $(dynamic_base)');

suite('Project Properties: the fields of each page (#792)', () => {
    test('the IDE\'s four pages, in its order', () => {
        assert.deepStrictEqual(PROJECT_PROPERTY_TABS.map(t => t.label), ['Application', 'Compiling', 'Debug', 'Build Events']);
        for (const tab of PROJECT_PROPERTY_TABS) {
            assert.ok(PROJECT_PROPERTY_FIELDS.some(f => f.tab === tab.id), `${tab.label} has fields`);
        }
    });

    test('every field names its property, once, and a select offers its values', () => {
        const names = PROJECT_PROPERTY_FIELDS.map(f => f.property.toLowerCase());
        assert.strictEqual(new Set(names).size, names.length, 'no property twice');
        for (const f of PROJECT_PROPERTY_FIELDS) {
            if (f.kind === 'select') assert.ok(f.options && f.options.length > 1, `${f.property} offers values`);
            if (f.kind === 'check') assert.deepStrictEqual([f.on, f.off], ['True', 'False'], `${f.property} stores True/False`);
        }
        for (const p of ['OutputName', 'OutputType', 'Model', 'DefineConstants', 'vid', 'dep', 'dynamic_base', 'StartAction', 'PostBuildEvent', 'RunPostBuildEvent']) {
            assert.ok(names.includes(p.toLowerCase()), p);
        }
    });

    test('the properties a build targets file reads', () => {
        const props = targetsProperties(C12_TARGETS);
        assert.ok(props.has('dep') && props.has('dynamic_base') && props.has('outputtype'));
        assert.ok(!targetsProperties(C10_TARGETS).has('dep'));
    });

    test('DEP and dynamic base are offered only when the installation\'s build reads them', () => {
        const dep = PROJECT_PROPERTY_FIELDS.find(f => f.property === 'dep')!;
        const vid = PROJECT_PROPERTY_FIELDS.find(f => f.property === 'vid')!;
        assert.deepStrictEqual(fieldAvailability(dep, targetsProperties(C12_TARGETS)), { available: true });
        const c10 = fieldAvailability(dep, targetsProperties(C10_TARGETS));
        assert.strictEqual(c10.available, false);
        assert.ok(/Clarion 12|this installation/i.test(c10.reason ?? ''), c10.reason);
        assert.deepStrictEqual(fieldAvailability(vid, targetsProperties(C10_TARGETS)), { available: true });
        // When the targets cannot be read, nothing is held back.
        assert.deepStrictEqual(fieldAvailability(dep, undefined), { available: true });
    });
});

import * as assert from 'assert';
import { PropertyService } from '../utils/PropertyService';

/**
 * #847: PROP:Break, PROP:Select, PROP:Slider and PROP:Ticks came into clarion-properties.json
 * from a scrape of the help (#73), but no Clarion declares them: PROPERTY.CLW has none of them
 * in Clarion 10 or 12, and `?Sld{PROP:Ticks}` (and the other three) fails to compile on both
 * with "Unknown identifier". The help's own PROP:Ticks page only links to the SLIDER page,
 * which describes NOTICKS. So the catalogue must not offer them, in completion or hover, while
 * the properties that do the job stay.
 */
suite('PROP: catalogue holds only properties Clarion declares (#847)', () => {

    const service = () => PropertyService.getInstance();

    for (const name of ['PROP:Break', 'PROP:Select', 'PROP:Slider', 'PROP:Ticks']) {
        test(`${name} is not a property`, () => {
            assert.strictEqual(service().isPropEquate(name), false, `${name} is still known`);
            assert.strictEqual(service().getPropEntry(name), undefined);
            const offered = service().getAllByPrefix('PROP:').map(e => e.name.toUpperCase());
            assert.ok(!offered.includes(name.toUpperCase()), `completion offers ${name}`);
        });
    }

    for (const name of ['PROP:BreakVar', 'PROP:SelStart', 'PROP:SelEnd', 'PROP:Selected', 'PROP:SliderPos',
        'PROP:RangeLow', 'PROP:RangeHigh', 'PROP:Step', 'PROP:NoTicks']) {
        test(`${name}, which does the job, is still a property`, () => {
            assert.ok(service().getPropEntry(name), `${name} is missing`);
        });
    }
});

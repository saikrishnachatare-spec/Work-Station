import {test,expect} from '@jest/globals';
import {screenName,mayTrackScreen} from '../screenTracking';
test('declined, unknown and guests collect nothing',()=>{expect(mayTrackScreen(true,'declined')).toBe(false);expect(mayTrackScreen(true,null)).toBe(false);expect(mayTrackScreen(false,'accepted')).toBe(false);expect(mayTrackScreen(true,'accepted')).toBe(true);});
test('tracking uses route names not identifiers',()=>{expect(screenName(['(tabs)'])).toBe('home');expect(screenName(['member','[id]'])).toBe('member/:id');expect(screenName(['group','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])).toBe('group/:id');});

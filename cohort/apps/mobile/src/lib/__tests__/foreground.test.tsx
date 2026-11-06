import { jest, expect, test } from '@jest/globals';
import { render, act } from '@testing-library/react-native';
import { Text, AppState } from 'react-native';
import { useForeground } from '../liveUpdates';

test('foreground follows lifecycle and removes listener',()=>{
 let changed:(s:string)=>void=()=>{};
 const remove=jest.fn();
 jest.spyOn(AppState,'addEventListener').mockImplementation((_type,listener)=>{changed=listener as typeof changed;return {remove};});
 const old=AppState.currentState;
 AppState.currentState='active';
 function Probe(){return <Text>{useForeground()?'visible':'paused'}</Text>;}
 const view=render(<Probe/>);
 expect(view.getByText('visible')).toBeTruthy();
 act(()=>{AppState.currentState='background';changed('background');});
 expect(view.getByText('paused')).toBeTruthy();
 act(()=>{AppState.currentState='active';changed('active');});
 expect(view.getByText('visible')).toBeTruthy();
 view.unmount();expect(remove).toHaveBeenCalledTimes(1);
 AppState.currentState=old;jest.restoreAllMocks();
});

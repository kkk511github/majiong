import {afterEach,expect,it,vi} from 'vitest';
import {visibleTimeout} from '../src/visible-timeout';
afterEach(()=>vi.useRealTimers());
function visibility(){
  const doc=Object.assign(new EventTarget(),{hidden:false});
  return {doc,hide:(hidden:boolean)=>{doc.hidden=hidden;doc.dispatchEvent(new Event('visibilitychange'));}};
}
it('加载期限只计算前台时间，后台两分钟不会误报超时',()=>{
  vi.useFakeTimers();const {doc,hide}=visibility(),done=vi.fn();
  const stop=visibleTimeout(done,20000,doc);
  vi.advanceTimersByTime(7000);hide(true);vi.advanceTimersByTime(120000);
  expect(done).not.toHaveBeenCalled();hide(false);vi.advanceTimersByTime(12999);
  expect(done).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(done).toHaveBeenCalledOnce();stop();
});
it('后台首次创建不启动计时，取消后无定时器或监听残留',()=>{
  vi.useFakeTimers();const {doc,hide}=visibility(),done=vi.fn();hide(true);
  const stop=visibleTimeout(done,300,doc);vi.advanceTimersByTime(60000);
  expect(done).not.toHaveBeenCalled();hide(false);vi.advanceTimersByTime(299);stop();
  hide(true);hide(false);vi.advanceTimersByTime(60000);expect(done).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

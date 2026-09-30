import { describe, expect, it } from 'vitest'
import { analyzeAdapterBindings } from '../src/design/adapter-binding.js'

/**
 * Regression tests for scope-aware adapter resolution. A real codebase has many
 * nested classes named `Adapter` / `VH` in different files; a simple-name global
 * index let the first file hijack later files.
 */
describe('analyzeAdapterBindings scoping', () => {
  it('resolves a nested Adapter within its own file, not another file', () => {
    // Screen file: host activity + nested Adapter (inflates item_screen) + VH.
    const screen = {
      path: '/src/ScreenActivity.java',
      content: `
        public class ScreenActivity extends Activity {
          RecyclerView recycler;
          protected void onCreate(Bundle b) {
            setContentView(R.layout.act_screen);
            recycler = findViewById(R.id.recycler);
            Adapter a = new Adapter();
            recycler.setAdapter(a);
          }
          class Adapter extends RecyclerView.Adapter<VH> {
            public VH onCreateViewHolder(ViewGroup p, int t) {
              return new VH(LayoutInflater.from(null).inflate(R.layout.item_screen, p, false));
            }
          }
          class VH extends RecyclerView.ViewHolder {
            VH(View v) { super(v); }
          }
        }`,
    }
    // Unrelated file that happens first and ALSO has a nested class Adapter.
    const other = {
      path: '/src/OtherActivity.java',
      content: `
        public class OtherActivity extends Activity {
          class Adapter extends RecyclerView.Adapter<OH> {
            public OH onCreateViewHolder(ViewGroup p, int t) {
              return new OH(LayoutInflater.from(null).inflate(R.layout.item_other, p, false));
            }
          }
          class OH extends RecyclerView.ViewHolder { OH(View v){ super(v);} }
        }`,
    }
    const bindings = analyzeAdapterBindings('act_screen', [other, screen])
    expect(bindings.layouts.act_screen?.recycler).toBe('item_screen')
    expect(bindings.layouts.act_screen?.recycler).not.toBe('item_other')
  })

  it('binds an inner adapter inside an item layout via the holder field id', () => {
    const host = {
      path: '/src/HostActivity.java',
      content: `
        public class HostActivity extends Activity {
          RecyclerView recycler;
          protected void onCreate(Bundle b) {
            setContentView(R.layout.act_host);
            recycler = findViewById(R.id.recycler);
            recycler.setAdapter(new RowAdapter());
          }
        }`,
    }
    const rowAdapter = {
      path: '/src/RowAdapter.java',
      content: `
        public class RowAdapter extends RecyclerView.Adapter<RowVH> {
          public RowVH onCreateViewHolder(ViewGroup p, int t) {
            View v = LayoutInflater.from(null).inflate(R.layout.item_row, p, false);
            return new RowVH(v);
          }
          public void onBindViewHolder(RowVH h, int pos) {
            h.inner.setAdapter(new InnerAdapter());
          }
        }
        class RowVH extends RecyclerView.ViewHolder {
          View inner;
          RowVH(View v) {
            super(v);
            inner = v.findViewById(R.id.inner_list);
          }
        }
        class InnerAdapter extends RecyclerView.Adapter<IVH> {
          public IVH onCreateViewHolder(ViewGroup p, int t) {
            return new IVH(LayoutInflater.from(null).inflate(R.layout.item_inner, p, false));
          }
        }
        class IVH extends RecyclerView.ViewHolder { IVH(View v){ super(v);} }`,
    }
    const bindings = analyzeAdapterBindings('act_host', [host, rowAdapter])
    expect(bindings.layouts.act_host?.recycler).toBe('item_row')
    // The nested inner surface is keyed by the containing ITEM layout.
    expect(bindings.layouts.item_row?.inner_list).toBe('item_inner')
  })

  it('ignores host classes that do not set the entry layout', () => {
    const files = [
      {
        path: '/src/A.java',
        content: `
          public class A extends Activity {
            RecyclerView r;
            void init() {
              setContentView(R.layout.act_other_page);
              r = findViewById(R.id.recycler);
              r.setAdapter(new SomeAdapter());
            }
          }
          class SomeAdapter extends RecyclerView.Adapter<H> {
            H onCreateViewHolder(ViewGroup p, int t) {
              return new H(LayoutInflater.from(null).inflate(R.layout.item_x, p, false));
            }
          }
          class H extends RecyclerView.ViewHolder { H(View v){ super(v);} }`,
      },
    ]
    const bindings = analyzeAdapterBindings('act_target', files)
    expect(bindings.layouts.act_target).toBeUndefined()
  })
})

//! Native classification sanity check: `cargo run --release --example classify`.
//! Three classes with distinct peak positions plus an RGB 4×4 image branch.
use lab_burn_cnn::CnnRegressor;

fn main() {
    let (rows, len, k) = (150usize, 200usize, 3usize);
    let image = 4 * 4 * 3;
    let cols = len + image;
    let mut x = vec![0.0f64; rows * cols];
    let mut y = vec![0.0f64; rows];
    for r in 0..rows {
        let class = r % k;
        y[r] = class as f64;
        let centre = 0.25 + 0.25 * class as f64;
        for j in 0..len {
            let p = j as f64 / len as f64;
            x[r * cols + j] = (-(p - centre).powi(2) / 0.005).exp() + 0.05 * (((r * 31 + j * 7) % 13) as f64 / 13.0);
        }
        for j in 0..image {
            x[r * cols + len + j] = if j % 3 == class { 200.0 } else { 40.0 } + ((r * 17 + j) % 11) as f64;
        }
    }
    for arch in ["compact", "nicon"] {
        let shapes = if arch == "nicon" { format!("[{len},1,1]") } else { format!("[{len},1,1,4,4,3]") };
        let kinds = if arch == "nicon" { "[1]" } else { "[1,2]" };
        let width = if arch == "nicon" { len } else { cols };
        let xs: Vec<f64> = (0..rows).flat_map(|r| x[r * cols..r * cols + width].to_vec()).collect();
        let config = format!(r#"{{"branch_kinds":{kinds},"branch_shapes":{shapes},"architecture":"{arch}","epochs":40,"batch_size":32,"learning_rate":0.005,"seed":7,"n_classes":{k}}}"#);
        let mut model = CnnRegressor::new(&config).ok().unwrap();
        model.fit(&xs, rows, width, &y).ok().unwrap();
        let proba = model.predict_proba(&xs, rows, width).ok().unwrap();
        assert_eq!(proba.len(), rows * k);
        assert!(proba.chunks(k).all(|row| (row.iter().sum::<f64>() - 1.0).abs() < 1e-9 && row.iter().all(|p| (0.0..=1.0).contains(p))));
        let labels = model.predict(&xs, rows, width).ok().unwrap();
        let accuracy = labels.iter().zip(&y).filter(|(a, b)| a == b).count() as f64 / rows as f64;
        let state = model.export_state().ok().unwrap();
        let again = CnnRegressor::from_state(&state).ok().unwrap().predict_proba(&xs, rows, width).ok().unwrap();
        let drift = proba.iter().zip(&again).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
        println!("{arch}: train accuracy {accuracy:.3}, replay max diff {drift:e}");
        assert!(accuracy > 0.9, "classification CNN failed to learn separable classes");
        assert!(drift < 1e-9);
    }
}

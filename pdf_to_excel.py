"""Original desktop interface; shares extraction with the web application."""
from __future__ import annotations
from PyQt6 import QtCore, QtGui, QtWidgets
from extraction_core import *

class PDFToExcelApp(QtWidgets.QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self._ui_font_size = DEFAULT_UI_FONT_SIZE
        self.setWindowTitle("Datasheet 比對工具")
        self._apply_swiss_minimal_theme()
        screen = QtGui.QGuiApplication.primaryScreen()
        if screen is not None:
            available = screen.availableGeometry()
            width, height = calculate_window_size(available.width(), available.height())
            self.resize(width, height)
        else:
            self.resize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
        central = QtWidgets.QWidget()
        self.setCentralWidget(central)
        root_layout = QtWidgets.QVBoxLayout(central)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)
        scroll_area = QtWidgets.QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
        scroll_content = QtWidgets.QWidget()
        layout = QtWidgets.QVBoxLayout(scroll_content)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(14)
        root_layout.addWidget(scroll_area)
        scroll_area.setWidget(scroll_content)

        self.new_pdf_path_edit = QtWidgets.QLineEdit()
        self.new_pdf_path_edit.setPlaceholderText("選擇新版 PDF 檔案")
        self.new_pdf_path_edit.setReadOnly(True)
        new_pdf_button = QtWidgets.QPushButton("匯入新版PDF")
        new_pdf_button.clicked.connect(self.select_new_pdf)

        new_pdf_row = QtWidgets.QHBoxLayout()
        new_pdf_row.addWidget(self.new_pdf_path_edit)
        new_pdf_row.addWidget(new_pdf_button)
        layout.addLayout(new_pdf_row)

        self.old_pdf_path_edit = QtWidgets.QLineEdit()
        self.old_pdf_path_edit.setPlaceholderText("選擇舊版 PDF 檔案")
        self.old_pdf_path_edit.setReadOnly(True)
        old_pdf_button = QtWidgets.QPushButton("匯入舊版PDF")
        old_pdf_button.clicked.connect(self.select_old_pdf)

        old_pdf_row = QtWidgets.QHBoxLayout()
        old_pdf_row.addWidget(self.old_pdf_path_edit)
        old_pdf_row.addWidget(old_pdf_button)
        layout.addLayout(old_pdf_row)

        self.output_path_edit = QtWidgets.QLineEdit()
        self.output_path_edit.setPlaceholderText("指定輸出 Excel 路徑")
        self.output_path_edit.setReadOnly(True)
        output_button = QtWidgets.QPushButton("輸出位置")
        output_button.clicked.connect(self.select_output)

        output_row = QtWidgets.QHBoxLayout()
        output_row.addWidget(self.output_path_edit)
        output_row.addWidget(output_button)
        layout.addLayout(output_row)

        page_layout = QtWidgets.QHBoxLayout()
        page_label = QtWidgets.QLabel("自訂頁碼 (逗號分隔, 空白=自動偵測 Electrical Characteristics 章節):")
        self.page_entry = QtWidgets.QLineEdit()
        self.page_entry.setPlaceholderText("例如 1,2,3")
        page_layout.addWidget(page_label)
        page_layout.addWidget(self.page_entry)
        layout.addLayout(page_layout)

        self.compare_checkbox = QtWidgets.QCheckBox("AC/DC SPEC 條件比對; 只HIGHLIGHT差異在新版")
        self.compare_checkbox.setChecked(False)
        layout.addWidget(self.compare_checkbox)

        self.convert_button = QtWidgets.QPushButton("轉換成 Excel")
        self.convert_button.setObjectName("primaryButton")
        self.convert_button.clicked.connect(self.convert_pdf)
        layout.addWidget(self.convert_button)

        self.log_view = QtWidgets.QTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setMinimumHeight(200)
        self.log_view.setLineWrapMode(QtWidgets.QTextEdit.LineWrapMode.NoWrap)
        self.log_view.setVerticalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.log_view.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        layout.addWidget(self.log_view)
        self._setup_zoom_shortcuts()

    def _apply_swiss_minimal_theme(self) -> None:
        self.setStyleSheet(SWISS_MINIMAL_STYLESHEET)
        app = QtWidgets.QApplication.instance()
        if app is not None:
            app.setFont(QtGui.QFont("Segoe UI", self._ui_font_size))

    def _setup_zoom_shortcuts(self) -> None:
        QtGui.QShortcut(QtGui.QKeySequence.StandardKey.ZoomIn, self, activated=self._zoom_in)
        QtGui.QShortcut(QtGui.QKeySequence.StandardKey.ZoomOut, self, activated=self._zoom_out)
        QtGui.QShortcut(QtGui.QKeySequence("Ctrl+0"), self, activated=self._reset_zoom)

    def _apply_ui_font_size(self, size: int) -> None:
        app = QtWidgets.QApplication.instance()
        if app is None:
            return
        self._ui_font_size = max(MIN_UI_FONT_SIZE, min(MAX_UI_FONT_SIZE, size))
        font = app.font()
        font.setPointSize(self._ui_font_size)
        app.setFont(font)

    def _zoom_in(self) -> None:
        self._apply_ui_font_size(self._ui_font_size + 1)

    def _zoom_out(self) -> None:
        self._apply_ui_font_size(self._ui_font_size - 1)

    def _reset_zoom(self) -> None:
        self._apply_ui_font_size(DEFAULT_UI_FONT_SIZE)

    def select_new_pdf(self) -> None:
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self,
            "選擇 PDF 檔案",
            "",
            "PDF Files (*.pdf)",
        )
        if file_path:
            self.new_pdf_path_edit.setText(file_path)
            self.append_log(f"已選擇新版 PDF: {file_path}")

    def select_old_pdf(self) -> None:
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self,
            "選擇 PDF 檔案",
            "",
            "PDF Files (*.pdf)",
        )
        if file_path:
            self.old_pdf_path_edit.setText(file_path)
            self.append_log(f"已選擇舊版 PDF: {file_path}")

    def select_output(self) -> None:
        file_path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self,
            "選擇輸出 Excel 路徑",
            "",
            "Excel Workbook (*.xlsx)",
        )
        if file_path:
            if not file_path.lower().endswith(".xlsx"):
                file_path = f"{file_path}.xlsx"
            self.output_path_edit.setText(file_path)
            self.append_log(f"輸出路徑: {file_path}")

    def convert_pdf(self) -> None:
        new_pdf_path_text = self.new_pdf_path_edit.text().strip()
        if not new_pdf_path_text:
            QtWidgets.QMessageBox.warning(self, "缺少 PDF", "請先匯入新版 PDF 檔案。")
            return
        new_pdf_path = Path(new_pdf_path_text)
        if not new_pdf_path.exists():
            QtWidgets.QMessageBox.critical(self, "找不到檔案", "指定的新版 PDF 檔案不存在。")
            return

        compare_enabled = self.compare_checkbox.isChecked()
        old_pdf_path_text = self.old_pdf_path_edit.text().strip()
        old_pdf_path: Optional[Path] = None
        if old_pdf_path_text:
            old_pdf_path = Path(old_pdf_path_text)
            if not old_pdf_path.exists():
                QtWidgets.QMessageBox.critical(self, "找不到檔案", "指定的舊版 PDF 檔案不存在。")
                return
        if compare_enabled and old_pdf_path is None:
            QtWidgets.QMessageBox.warning(self, "缺少舊版 PDF", "比對格式需要匯入舊版 PDF。")
            return

        output_path_text = self.output_path_edit.text().strip()
        if not output_path_text:
            QtWidgets.QMessageBox.warning(self, "缺少輸出路徑", "請指定輸出的 Excel 檔案位置。")
            return
        output_path = Path(output_path_text)
        if output_path.exists():
            choice = QtWidgets.QMessageBox.question(
                self,
                "輸出檔案已存在",
                f"{output_path.name} 已存在，是否覆寫？\n"
                "將先建立同資料夾備份檔 (*.bak.xlsx)。",
                QtWidgets.QMessageBox.StandardButton.Yes
                | QtWidgets.QMessageBox.StandardButton.No,
                QtWidgets.QMessageBox.StandardButton.No,
            )
            if choice != QtWidgets.QMessageBox.StandardButton.Yes:
                return
            backup_path = output_path.with_suffix(".bak.xlsx")
            try:
                shutil.copy2(output_path, backup_path)
                self.append_log(f"已建立備份: {backup_path}")
            except OSError as exc:
                QtWidgets.QMessageBox.critical(
                    self, "備份失敗", f"無法建立備份檔案: {exc}"
                )
                return

        try:
            custom_pages = parse_page_input(self.page_entry.text())
        except ValueError as exc:
            QtWidgets.QMessageBox.warning(self, "頁碼格式錯誤", str(exc))
            return

        self.convert_button.setEnabled(False)
        self.append_log("開始解析 PDF...")

        try:
            tables_new = extract_tables(
                new_pdf_path,
                list(ALL_SECTION_LABELS),
                custom_pages,
            )
            tables_old: List[TableExtraction] = []
            if old_pdf_path is not None:
                tables_old = extract_tables(
                    old_pdf_path,
                    list(ALL_SECTION_LABELS),
                    custom_pages,
                )
        except Exception as exc:  # pragma: no cover - GUI feedback
            QtWidgets.QMessageBox.critical(self, "解析失敗", str(exc))
            self.convert_button.setEnabled(True)
            return

        if not tables_new:
            QtWidgets.QMessageBox.information(self, "沒有資料", "在指定條件中找不到新版表格。")
            self.append_log("未找到任何新版表格。")
            self.convert_button.setEnabled(True)
            return

        try:
            compared_sheet_map = self.write_to_excel(
                output_path,
                tables_new,
                tables_old,
                compare_enabled,
            )
            apply_text_cell_fill(output_path)
            apply_sheet_formatting(output_path)
            if compare_enabled and compared_sheet_map:
                apply_comparison_highlights(output_path, compared_sheet_map)
        except Exception as exc:  # pragma: no cover - GUI feedback
            QtWidgets.QMessageBox.critical(self, "匯出失敗", str(exc))
            self.convert_button.setEnabled(True)
            return

        self.append_log(f"已輸出 Excel: {output_path}")
        QtWidgets.QMessageBox.information(self, "完成", "表格已成功輸出為 Excel。")
        self.convert_button.setEnabled(True)

    def write_to_excel(
        self,
        output_path: Path,
        new_tables: List[TableExtraction],
        old_tables: List[TableExtraction],
        compare_enabled: bool,
    ) -> Dict[str, pd.DataFrame]:
        """Write only new-version tables to Excel.

        Returns compare_pairs: sheet_name → (new_part_df, old_part_df)
        for downstream comparison annotation.
        """
        sheet_usage: Dict[str, int] = {}
        grouped_new = group_tables_by_label(new_tables)
        grouped_old = group_tables_by_label(old_tables)

        # Preserve PDF page order (not alphabetical sort)
        label_order: List[str] = list(dict.fromkeys(
            t.section or f"Page_{t.page_number}" for t in new_tables
        ))
        for t in old_tables:
            lbl = t.section or f"Page_{t.page_number}"
            if lbl not in label_order:
                label_order.append(lbl)

        # compare_pairs: sheet_name → (new_part_df, old_part_df) — filled during write
        compare_pairs: Dict[str, Any] = {}
        # Lazy SPEC assignment: only assign SPEC numbers to labels that produce actual output
        spec_map: Dict[str, str] = {}
        lazy_spec_counter = 1

        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            for label in label_order:
                header_tokens = get_header_tokens_for_label(label)

                new_frames = grouped_new.get(label)
                if not new_frames:
                    continue
                new_parts = self._process_label_frames(
                    new_frames, label, header_tokens, label
                )
                if not new_parts:
                    continue

                # Assign SPEC number only on first confirmed output for this label
                if label not in spec_map and not label.startswith("Custom Page"):
                    spec_map[label] = f"SPEC{lazy_spec_counter}"
                    lazy_spec_counter += 1
                display_label = spec_map.get(label, label)

                # Process old frames (suppress logs) and apply same row-count filter
                raw_old: List[pd.DataFrame] = []
                if compare_enabled and grouped_old.get(label):
                    raw_old = self._process_label_frames(
                        grouped_old[label], label, header_tokens,
                        display_label, log_enabled=False,
                    )
                old_parts = [op for op in raw_old if non_empty_row_count(op) > 4]

                # Pre-pair new→old sub-tables by content signature (1:1, no double-use)
                # valid_pairs contains only new parts with enough rows → T-numbers are sequential
                valid_new = [p for p in new_parts if non_empty_row_count(p) > 4]
                if len(valid_new) < len(new_parts):
                    skipped = len(new_parts) - len(valid_new)
                    self.append_log(f"跳過 {display_label} 中 {skipped} 個資料行數不足的子表")
                pairs = _pair_parts(valid_new, old_parts)

                for written_idx, (part, old_match) in enumerate(pairs, start=1):
                    part = _fill_merged_cells(part)
                    part = _drop_empty_columns(part)

                    # Sequential T-numbers: T1, T2, T3 (no gaps from filtered tables)
                    table_tag = f"T{written_idx}" if len(pairs) > 1 else ""
                    sheet_name = self._resolve_sheet_name(display_label, table_tag, sheet_usage)

                    if compare_enabled and old_match is not None:
                        compare_pairs[sheet_name] = (
                            part, _fill_merged_cells(_drop_empty_columns(old_match))
                        )

                    # Prepend section title row (row 1)
                    n_cols = part.shape[1]
                    title_df = pd.DataFrame(
                        [[label] + [''] * (n_cols - 1)], columns=range(n_cols)
                    )
                    part_out = pd.concat([title_df, part], ignore_index=True)
                    part_out.to_excel(writer, sheet_name=sheet_name, index=False, header=False)

        return compare_pairs

    def _resolve_sheet_name(
        self, label: str, table_tag: str, sheet_usage: Dict[str, int]
    ) -> str:
        safe_label = sanitize_sheet_fragment(label)[:28]
        base_name = (f"{safe_label}_{table_tag}" if table_tag else safe_label)[:31]
        count = sheet_usage.get(base_name, 0)
        sheet_usage[base_name] = count + 1
        if count == 0:
            return base_name
        suffix = f"_{count + 1}"
        return f"{base_name[: 31 - len(suffix)]}{suffix}"

    def _process_label_frames(
        self,
        frames: List[pd.DataFrame],
        label: str,
        header_tokens: Set[str],
        log_prefix: str,
        log_enabled: bool = True,
    ) -> List[pd.DataFrame]:
        """Run frames through the full cleaning pipeline, return split parts."""
        pre = [
            _merge_continuation_rows(_flatten_newlines(compact_split_spec_table(f)))
            for f in frames
        ]
        combined = combine_tables(pre)
        combined = clean_table(combined, header_tokens)
        if combined.empty:
            if log_enabled:
                self.append_log(f"跳過 {log_prefix} (找不到指定標題)")
            return []
        combined = filter_flagged_rows(combined, header_tokens)
        if combined.empty:
            if log_enabled:
                self.append_log(f"跳過 {log_prefix} (MIN/TYP/MAX 含附註或刪除內容)")
            return []
        combined = compact_address_mode_dummy_cycle(combined)
        parts = split_table_on_repeated_headers(combined, header_tokens)
        if not parts:
            if log_enabled:
                self.append_log(f"跳過 {log_prefix} (切分後無有效表格)")
        return parts

    def append_log(self, message: str) -> None:
        timestamp = QtCore.QDateTime.currentDateTime().toString("yyyy-MM-dd HH:mm:ss")
        self.log_view.append(f"[{timestamp}] {message}")


def main() -> None:
    app = QtWidgets.QApplication(sys.argv)
    window = PDFToExcelApp()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

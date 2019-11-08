/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 534.0, "minX": 0.0, "maxY": 25180.0, "series": [{"data": [[0.0, 534.0], [0.1, 565.0], [0.2, 617.0], [0.3, 704.0], [0.4, 757.0], [0.5, 778.0], [0.6, 830.0], [0.7, 909.0], [0.8, 961.0], [0.9, 1090.0], [1.0, 1122.0], [1.1, 1220.0], [1.2, 1313.0], [1.3, 1468.0], [1.4, 1667.0], [1.5, 1763.0], [1.6, 1894.0], [1.7, 2030.0], [1.8, 2168.0], [1.9, 2232.0], [2.0, 2402.0], [2.1, 2608.0], [2.2, 2688.0], [2.3, 2858.0], [2.4, 3024.0], [2.5, 3108.0], [2.6, 3188.0], [2.7, 3241.0], [2.8, 3296.0], [2.9, 3302.0], [3.0, 3312.0], [3.1, 3399.0], [3.2, 3418.0], [3.3, 3491.0], [3.4, 3578.0], [3.5, 3608.0], [3.6, 3669.0], [3.7, 3689.0], [3.8, 3733.0], [3.9, 3761.0], [4.0, 3787.0], [4.1, 3801.0], [4.2, 3824.0], [4.3, 3858.0], [4.4, 3892.0], [4.5, 3908.0], [4.6, 3933.0], [4.7, 3982.0], [4.8, 4011.0], [4.9, 4067.0], [5.0, 4094.0], [5.1, 4104.0], [5.2, 4131.0], [5.3, 4140.0], [5.4, 4147.0], [5.5, 4155.0], [5.6, 4159.0], [5.7, 4191.0], [5.8, 4233.0], [5.9, 4243.0], [6.0, 4253.0], [6.1, 4263.0], [6.2, 4273.0], [6.3, 4279.0], [6.4, 4315.0], [6.5, 4318.0], [6.6, 4341.0], [6.7, 4352.0], [6.8, 4370.0], [6.9, 4400.0], [7.0, 4427.0], [7.1, 4429.0], [7.2, 4457.0], [7.3, 4481.0], [7.4, 4494.0], [7.5, 4504.0], [7.6, 4513.0], [7.7, 4557.0], [7.8, 4568.0], [7.9, 4577.0], [8.0, 4585.0], [8.1, 4597.0], [8.2, 4627.0], [8.3, 4645.0], [8.4, 4658.0], [8.5, 4671.0], [8.6, 4675.0], [8.7, 4682.0], [8.8, 4695.0], [8.9, 4709.0], [9.0, 4732.0], [9.1, 4753.0], [9.2, 4763.0], [9.3, 4777.0], [9.4, 4780.0], [9.5, 4788.0], [9.6, 4800.0], [9.7, 4803.0], [9.8, 4837.0], [9.9, 4843.0], [10.0, 4847.0], [10.1, 4860.0], [10.2, 4878.0], [10.3, 4888.0], [10.4, 4914.0], [10.5, 4927.0], [10.6, 4929.0], [10.7, 4940.0], [10.8, 4945.0], [10.9, 4961.0], [11.0, 4975.0], [11.1, 4983.0], [11.2, 4991.0], [11.3, 4998.0], [11.4, 5010.0], [11.5, 5048.0], [11.6, 5055.0], [11.7, 5081.0], [11.8, 5094.0], [11.9, 5115.0], [12.0, 5144.0], [12.1, 5157.0], [12.2, 5164.0], [12.3, 5193.0], [12.4, 5210.0], [12.5, 5215.0], [12.6, 5245.0], [12.7, 5255.0], [12.8, 5263.0], [12.9, 5288.0], [13.0, 5306.0], [13.1, 5326.0], [13.2, 5339.0], [13.3, 5353.0], [13.4, 5370.0], [13.5, 5390.0], [13.6, 5404.0], [13.7, 5420.0], [13.8, 5445.0], [13.9, 5483.0], [14.0, 5502.0], [14.1, 5516.0], [14.2, 5531.0], [14.3, 5564.0], [14.4, 5579.0], [14.5, 5605.0], [14.6, 5625.0], [14.7, 5640.0], [14.8, 5663.0], [14.9, 5687.0], [15.0, 5696.0], [15.1, 5706.0], [15.2, 5744.0], [15.3, 5758.0], [15.4, 5769.0], [15.5, 5776.0], [15.6, 5786.0], [15.7, 5805.0], [15.8, 5815.0], [15.9, 5841.0], [16.0, 5853.0], [16.1, 5863.0], [16.2, 5890.0], [16.3, 5914.0], [16.4, 5966.0], [16.5, 5979.0], [16.6, 5985.0], [16.7, 5994.0], [16.8, 6005.0], [16.9, 6064.0], [17.0, 6068.0], [17.1, 6107.0], [17.2, 6122.0], [17.3, 6167.0], [17.4, 6190.0], [17.5, 6220.0], [17.6, 6258.0], [17.7, 6287.0], [17.8, 6340.0], [17.9, 6358.0], [18.0, 6387.0], [18.1, 6403.0], [18.2, 6414.0], [18.3, 6431.0], [18.4, 6450.0], [18.5, 6457.0], [18.6, 6493.0], [18.7, 6517.0], [18.8, 6542.0], [18.9, 6575.0], [19.0, 6615.0], [19.1, 6636.0], [19.2, 6738.0], [19.3, 6777.0], [19.4, 6817.0], [19.5, 6839.0], [19.6, 6874.0], [19.7, 6911.0], [19.8, 6950.0], [19.9, 6954.0], [20.0, 6962.0], [20.1, 6974.0], [20.2, 6987.0], [20.3, 7016.0], [20.4, 7051.0], [20.5, 7096.0], [20.6, 7109.0], [20.7, 7135.0], [20.8, 7156.0], [20.9, 7198.0], [21.0, 7217.0], [21.1, 7222.0], [21.2, 7238.0], [21.3, 7271.0], [21.4, 7323.0], [21.5, 7367.0], [21.6, 7381.0], [21.7, 7385.0], [21.8, 7416.0], [21.9, 7429.0], [22.0, 7459.0], [22.1, 7492.0], [22.2, 7532.0], [22.3, 7560.0], [22.4, 7580.0], [22.5, 7595.0], [22.6, 7602.0], [22.7, 7647.0], [22.8, 7679.0], [22.9, 7757.0], [23.0, 7774.0], [23.1, 7817.0], [23.2, 7851.0], [23.3, 7875.0], [23.4, 7894.0], [23.5, 7916.0], [23.6, 7937.0], [23.7, 7950.0], [23.8, 7995.0], [23.9, 8045.0], [24.0, 8067.0], [24.1, 8081.0], [24.2, 8089.0], [24.3, 8105.0], [24.4, 8120.0], [24.5, 8135.0], [24.6, 8171.0], [24.7, 8187.0], [24.8, 8200.0], [24.9, 8283.0], [25.0, 8293.0], [25.1, 8315.0], [25.2, 8339.0], [25.3, 8355.0], [25.4, 8359.0], [25.5, 8374.0], [25.6, 8390.0], [25.7, 8426.0], [25.8, 8446.0], [25.9, 8466.0], [26.0, 8486.0], [26.1, 8497.0], [26.2, 8511.0], [26.3, 8543.0], [26.4, 8552.0], [26.5, 8568.0], [26.6, 8581.0], [26.7, 8602.0], [26.8, 8619.0], [26.9, 8654.0], [27.0, 8700.0], [27.1, 8707.0], [27.2, 8739.0], [27.3, 8744.0], [27.4, 8757.0], [27.5, 8760.0], [27.6, 8774.0], [27.7, 8781.0], [27.8, 8799.0], [27.9, 8808.0], [28.0, 8820.0], [28.1, 8830.0], [28.2, 8853.0], [28.3, 8872.0], [28.4, 8893.0], [28.5, 8913.0], [28.6, 8938.0], [28.7, 8956.0], [28.8, 8992.0], [28.9, 9029.0], [29.0, 9050.0], [29.1, 9083.0], [29.2, 9101.0], [29.3, 9126.0], [29.4, 9170.0], [29.5, 9191.0], [29.6, 9205.0], [29.7, 9229.0], [29.8, 9249.0], [29.9, 9275.0], [30.0, 9318.0], [30.1, 9332.0], [30.2, 9338.0], [30.3, 9356.0], [30.4, 9381.0], [30.5, 9416.0], [30.6, 9433.0], [30.7, 9470.0], [30.8, 9483.0], [30.9, 9516.0], [31.0, 9547.0], [31.1, 9581.0], [31.2, 9604.0], [31.3, 9614.0], [31.4, 9636.0], [31.5, 9665.0], [31.6, 9693.0], [31.7, 9716.0], [31.8, 9740.0], [31.9, 9754.0], [32.0, 9786.0], [32.1, 9807.0], [32.2, 9821.0], [32.3, 9834.0], [32.4, 9848.0], [32.5, 9851.0], [32.6, 9866.0], [32.7, 9885.0], [32.8, 9912.0], [32.9, 9924.0], [33.0, 9931.0], [33.1, 9957.0], [33.2, 9983.0], [33.3, 9987.0], [33.4, 9998.0], [33.5, 10008.0], [33.6, 10025.0], [33.7, 10037.0], [33.8, 10064.0], [33.9, 10082.0], [34.0, 10091.0], [34.1, 10103.0], [34.2, 10108.0], [34.3, 10126.0], [34.4, 10150.0], [34.5, 10163.0], [34.6, 10182.0], [34.7, 10191.0], [34.8, 10200.0], [34.9, 10229.0], [35.0, 10243.0], [35.1, 10250.0], [35.2, 10268.0], [35.3, 10276.0], [35.4, 10280.0], [35.5, 10291.0], [35.6, 10302.0], [35.7, 10305.0], [35.8, 10330.0], [35.9, 10342.0], [36.0, 10353.0], [36.1, 10378.0], [36.2, 10405.0], [36.3, 10422.0], [36.4, 10429.0], [36.5, 10462.0], [36.6, 10506.0], [36.7, 10517.0], [36.8, 10529.0], [36.9, 10563.0], [37.0, 10564.0], [37.1, 10582.0], [37.2, 10601.0], [37.3, 10615.0], [37.4, 10620.0], [37.5, 10642.0], [37.6, 10657.0], [37.7, 10665.0], [37.8, 10679.0], [37.9, 10687.0], [38.0, 10702.0], [38.1, 10728.0], [38.2, 10735.0], [38.3, 10747.0], [38.4, 10784.0], [38.5, 10788.0], [38.6, 10801.0], [38.7, 10821.0], [38.8, 10832.0], [38.9, 10847.0], [39.0, 10866.0], [39.1, 10870.0], [39.2, 10909.0], [39.3, 10938.0], [39.4, 10947.0], [39.5, 10954.0], [39.6, 10958.0], [39.7, 10991.0], [39.8, 11013.0], [39.9, 11029.0], [40.0, 11057.0], [40.1, 11076.0], [40.2, 11091.0], [40.3, 11111.0], [40.4, 11174.0], [40.5, 11212.0], [40.6, 11220.0], [40.7, 11263.0], [40.8, 11280.0], [40.9, 11294.0], [41.0, 11350.0], [41.1, 11387.0], [41.2, 11409.0], [41.3, 11455.0], [41.4, 11493.0], [41.5, 11511.0], [41.6, 11547.0], [41.7, 11584.0], [41.8, 11593.0], [41.9, 11637.0], [42.0, 11661.0], [42.1, 11674.0], [42.2, 11698.0], [42.3, 11720.0], [42.4, 11750.0], [42.5, 11782.0], [42.6, 11798.0], [42.7, 11817.0], [42.8, 11855.0], [42.9, 11880.0], [43.0, 11954.0], [43.1, 11988.0], [43.2, 12017.0], [43.3, 12046.0], [43.4, 12064.0], [43.5, 12101.0], [43.6, 12134.0], [43.7, 12187.0], [43.8, 12224.0], [43.9, 12268.0], [44.0, 12310.0], [44.1, 12360.0], [44.2, 12410.0], [44.3, 12446.0], [44.4, 12492.0], [44.5, 12516.0], [44.6, 12549.0], [44.7, 12555.0], [44.8, 12564.0], [44.9, 12602.0], [45.0, 12622.0], [45.1, 12664.0], [45.2, 12699.0], [45.3, 12725.0], [45.4, 12747.0], [45.5, 12752.0], [45.6, 12821.0], [45.7, 12839.0], [45.8, 12849.0], [45.9, 12886.0], [46.0, 12911.0], [46.1, 12926.0], [46.2, 12949.0], [46.3, 12989.0], [46.4, 13001.0], [46.5, 13022.0], [46.6, 13032.0], [46.7, 13050.0], [46.8, 13071.0], [46.9, 13113.0], [47.0, 13148.0], [47.1, 13170.0], [47.2, 13194.0], [47.3, 13243.0], [47.4, 13303.0], [47.5, 13319.0], [47.6, 13352.0], [47.7, 13367.0], [47.8, 13376.0], [47.9, 13417.0], [48.0, 13434.0], [48.1, 13454.0], [48.2, 13483.0], [48.3, 13501.0], [48.4, 13525.0], [48.5, 13539.0], [48.6, 13549.0], [48.7, 13601.0], [48.8, 13618.0], [48.9, 13628.0], [49.0, 13658.0], [49.1, 13681.0], [49.2, 13701.0], [49.3, 13728.0], [49.4, 13798.0], [49.5, 13805.0], [49.6, 13815.0], [49.7, 13839.0], [49.8, 13856.0], [49.9, 13897.0], [50.0, 13929.0], [50.1, 13947.0], [50.2, 13953.0], [50.3, 13979.0], [50.4, 13989.0], [50.5, 14013.0], [50.6, 14042.0], [50.7, 14059.0], [50.8, 14109.0], [50.9, 14139.0], [51.0, 14163.0], [51.1, 14181.0], [51.2, 14206.0], [51.3, 14226.0], [51.4, 14235.0], [51.5, 14267.0], [51.6, 14307.0], [51.7, 14336.0], [51.8, 14365.0], [51.9, 14378.0], [52.0, 14382.0], [52.1, 14393.0], [52.2, 14417.0], [52.3, 14472.0], [52.4, 14544.0], [52.5, 14563.0], [52.6, 14619.0], [52.7, 14632.0], [52.8, 14655.0], [52.9, 14666.0], [53.0, 14716.0], [53.1, 14728.0], [53.2, 14747.0], [53.3, 14781.0], [53.4, 14802.0], [53.5, 14819.0], [53.6, 14857.0], [53.7, 14889.0], [53.8, 14932.0], [53.9, 14955.0], [54.0, 14984.0], [54.1, 14994.0], [54.2, 15025.0], [54.3, 15055.0], [54.4, 15081.0], [54.5, 15098.0], [54.6, 15146.0], [54.7, 15172.0], [54.8, 15180.0], [54.9, 15241.0], [55.0, 15263.0], [55.1, 15298.0], [55.2, 15362.0], [55.3, 15375.0], [55.4, 15395.0], [55.5, 15452.0], [55.6, 15485.0], [55.7, 15515.0], [55.8, 15553.0], [55.9, 15569.0], [56.0, 15592.0], [56.1, 15684.0], [56.2, 15747.0], [56.3, 15786.0], [56.4, 15802.0], [56.5, 15864.0], [56.6, 15906.0], [56.7, 15952.0], [56.8, 15970.0], [56.9, 16050.0], [57.0, 16091.0], [57.1, 16103.0], [57.2, 16139.0], [57.3, 16165.0], [57.4, 16195.0], [57.5, 16208.0], [57.6, 16266.0], [57.7, 16291.0], [57.8, 16317.0], [57.9, 16383.0], [58.0, 16400.0], [58.1, 16452.0], [58.2, 16465.0], [58.3, 16489.0], [58.4, 16512.0], [58.5, 16521.0], [58.6, 16564.0], [58.7, 16581.0], [58.8, 16610.0], [58.9, 16659.0], [59.0, 16707.0], [59.1, 16720.0], [59.2, 16778.0], [59.3, 16795.0], [59.4, 16818.0], [59.5, 16841.0], [59.6, 16875.0], [59.7, 16901.0], [59.8, 16949.0], [59.9, 16956.0], [60.0, 16996.0], [60.1, 17012.0], [60.2, 17068.0], [60.3, 17136.0], [60.4, 17180.0], [60.5, 17236.0], [60.6, 17281.0], [60.7, 17304.0], [60.8, 17383.0], [60.9, 17416.0], [61.0, 17469.0], [61.1, 17502.0], [61.2, 17580.0], [61.3, 17605.0], [61.4, 17697.0], [61.5, 17727.0], [61.6, 17802.0], [61.7, 17830.0], [61.8, 17856.0], [61.9, 17894.0], [62.0, 17928.0], [62.1, 17973.0], [62.2, 18016.0], [62.3, 18033.0], [62.4, 18076.0], [62.5, 18104.0], [62.6, 18175.0], [62.7, 18258.0], [62.8, 18286.0], [62.9, 18329.0], [63.0, 18370.0], [63.1, 18421.0], [63.2, 18462.0], [63.3, 18492.0], [63.4, 18539.0], [63.5, 18551.0], [63.6, 18594.0], [63.7, 18619.0], [63.8, 18630.0], [63.9, 18659.0], [64.0, 18726.0], [64.1, 18748.0], [64.2, 18759.0], [64.3, 18788.0], [64.4, 18811.0], [64.5, 18840.0], [64.6, 18858.0], [64.7, 18872.0], [64.8, 18884.0], [64.9, 18905.0], [65.0, 18937.0], [65.1, 18951.0], [65.2, 18965.0], [65.3, 19004.0], [65.4, 19021.0], [65.5, 19033.0], [65.6, 19044.0], [65.7, 19098.0], [65.8, 19111.0], [65.9, 19117.0], [66.0, 19144.0], [66.1, 19151.0], [66.2, 19177.0], [66.3, 19201.0], [66.4, 19207.0], [66.5, 19230.0], [66.6, 19236.0], [66.7, 19256.0], [66.8, 19263.0], [66.9, 19294.0], [67.0, 19317.0], [67.1, 19331.0], [67.2, 19367.0], [67.3, 19386.0], [67.4, 19412.0], [67.5, 19428.0], [67.6, 19451.0], [67.7, 19481.0], [67.8, 19513.0], [67.9, 19536.0], [68.0, 19578.0], [68.1, 19609.0], [68.2, 19630.0], [68.3, 19667.0], [68.4, 19679.0], [68.5, 19708.0], [68.6, 19714.0], [68.7, 19753.0], [68.8, 19772.0], [68.9, 19817.0], [69.0, 19848.0], [69.1, 19869.0], [69.2, 19887.0], [69.3, 19928.0], [69.4, 19942.0], [69.5, 19946.0], [69.6, 19975.0], [69.7, 19989.0], [69.8, 20001.0], [69.9, 20019.0], [70.0, 20037.0], [70.1, 20061.0], [70.2, 20066.0], [70.3, 20102.0], [70.4, 20123.0], [70.5, 20139.0], [70.6, 20147.0], [70.7, 20179.0], [70.8, 20217.0], [70.9, 20238.0], [71.0, 20268.0], [71.1, 20288.0], [71.2, 20303.0], [71.3, 20314.0], [71.4, 20324.0], [71.5, 20371.0], [71.6, 20388.0], [71.7, 20419.0], [71.8, 20448.0], [71.9, 20467.0], [72.0, 20475.0], [72.1, 20483.0], [72.2, 20496.0], [72.3, 20517.0], [72.4, 20538.0], [72.5, 20550.0], [72.6, 20566.0], [72.7, 20569.0], [72.8, 20578.0], [72.9, 20601.0], [73.0, 20616.0], [73.1, 20645.0], [73.2, 20656.0], [73.3, 20673.0], [73.4, 20684.0], [73.5, 20689.0], [73.6, 20700.0], [73.7, 20719.0], [73.8, 20734.0], [73.9, 20745.0], [74.0, 20759.0], [74.1, 20765.0], [74.2, 20789.0], [74.3, 20800.0], [74.4, 20810.0], [74.5, 20846.0], [74.6, 20864.0], [74.7, 20880.0], [74.8, 20899.0], [74.9, 20904.0], [75.0, 20921.0], [75.1, 20946.0], [75.2, 20955.0], [75.3, 20969.0], [75.4, 20973.0], [75.5, 20989.0], [75.6, 21002.0], [75.7, 21012.0], [75.8, 21027.0], [75.9, 21042.0], [76.0, 21050.0], [76.1, 21055.0], [76.2, 21063.0], [76.3, 21075.0], [76.4, 21081.0], [76.5, 21102.0], [76.6, 21108.0], [76.7, 21124.0], [76.8, 21157.0], [76.9, 21177.0], [77.0, 21193.0], [77.1, 21206.0], [77.2, 21216.0], [77.3, 21243.0], [77.4, 21260.0], [77.5, 21290.0], [77.6, 21326.0], [77.7, 21328.0], [77.8, 21352.0], [77.9, 21371.0], [78.0, 21383.0], [78.1, 21429.0], [78.2, 21445.0], [78.3, 21457.0], [78.4, 21468.0], [78.5, 21495.0], [78.6, 21499.0], [78.7, 21518.0], [78.8, 21547.0], [78.9, 21554.0], [79.0, 21563.0], [79.1, 21578.0], [79.2, 21580.0], [79.3, 21596.0], [79.4, 21603.0], [79.5, 21619.0], [79.6, 21630.0], [79.7, 21644.0], [79.8, 21684.0], [79.9, 21712.0], [80.0, 21733.0], [80.1, 21767.0], [80.2, 21782.0], [80.3, 21785.0], [80.4, 21808.0], [80.5, 21827.0], [80.6, 21856.0], [80.7, 21893.0], [80.8, 21903.0], [80.9, 21908.0], [81.0, 21942.0], [81.1, 21945.0], [81.2, 21956.0], [81.3, 21994.0], [81.4, 22025.0], [81.5, 22080.0], [81.6, 22140.0], [81.7, 22195.0], [81.8, 22223.0], [81.9, 22240.0], [82.0, 22312.0], [82.1, 22334.0], [82.2, 22345.0], [82.3, 22394.0], [82.4, 22450.0], [82.5, 22460.0], [82.6, 22481.0], [82.7, 22504.0], [82.8, 22539.0], [82.9, 22561.0], [83.0, 22598.0], [83.1, 22610.0], [83.2, 22617.0], [83.3, 22661.0], [83.4, 22693.0], [83.5, 22704.0], [83.6, 22725.0], [83.7, 22750.0], [83.8, 22760.0], [83.9, 22777.0], [84.0, 22781.0], [84.1, 22796.0], [84.2, 22826.0], [84.3, 22841.0], [84.4, 22879.0], [84.5, 22891.0], [84.6, 22898.0], [84.7, 22907.0], [84.8, 22932.0], [84.9, 22961.0], [85.0, 22973.0], [85.1, 22991.0], [85.2, 23000.0], [85.3, 23013.0], [85.4, 23047.0], [85.5, 23059.0], [85.6, 23069.0], [85.7, 23085.0], [85.8, 23099.0], [85.9, 23112.0], [86.0, 23158.0], [86.1, 23169.0], [86.2, 23174.0], [86.3, 23180.0], [86.4, 23197.0], [86.5, 23217.0], [86.6, 23230.0], [86.7, 23245.0], [86.8, 23266.0], [86.9, 23293.0], [87.0, 23307.0], [87.1, 23314.0], [87.2, 23334.0], [87.3, 23338.0], [87.4, 23356.0], [87.5, 23372.0], [87.6, 23380.0], [87.7, 23437.0], [87.8, 23453.0], [87.9, 23474.0], [88.0, 23480.0], [88.1, 23507.0], [88.2, 23541.0], [88.3, 23560.0], [88.4, 23566.0], [88.5, 23569.0], [88.6, 23592.0], [88.7, 23603.0], [88.8, 23610.0], [88.9, 23629.0], [89.0, 23641.0], [89.1, 23651.0], [89.2, 23656.0], [89.3, 23668.0], [89.4, 23675.0], [89.5, 23691.0], [89.6, 23710.0], [89.7, 23719.0], [89.8, 23735.0], [89.9, 23743.0], [90.0, 23747.0], [90.1, 23762.0], [90.2, 23781.0], [90.3, 23801.0], [90.4, 23815.0], [90.5, 23819.0], [90.6, 23844.0], [90.7, 23859.0], [90.8, 23864.0], [90.9, 23885.0], [91.0, 23900.0], [91.1, 23910.0], [91.2, 23927.0], [91.3, 23932.0], [91.4, 23943.0], [91.5, 23948.0], [91.6, 23958.0], [91.7, 23967.0], [91.8, 23971.0], [91.9, 23979.0], [92.0, 23987.0], [92.1, 23993.0], [92.2, 24005.0], [92.3, 24012.0], [92.4, 24016.0], [92.5, 24043.0], [92.6, 24055.0], [92.7, 24061.0], [92.8, 24081.0], [92.9, 24088.0], [93.0, 24089.0], [93.1, 24096.0], [93.2, 24108.0], [93.3, 24115.0], [93.4, 24122.0], [93.5, 24127.0], [93.6, 24138.0], [93.7, 24145.0], [93.8, 24151.0], [93.9, 24155.0], [94.0, 24164.0], [94.1, 24171.0], [94.2, 24173.0], [94.3, 24174.0], [94.4, 24179.0], [94.5, 24195.0], [94.6, 24198.0], [94.7, 24204.0], [94.8, 24210.0], [94.9, 24223.0], [95.0, 24233.0], [95.1, 24240.0], [95.2, 24261.0], [95.3, 24263.0], [95.4, 24269.0], [95.5, 24280.0], [95.6, 24285.0], [95.7, 24292.0], [95.8, 24306.0], [95.9, 24328.0], [96.0, 24352.0], [96.1, 24356.0], [96.2, 24371.0], [96.3, 24379.0], [96.4, 24386.0], [96.5, 24394.0], [96.6, 24402.0], [96.7, 24427.0], [96.8, 24438.0], [96.9, 24462.0], [97.0, 24466.0], [97.1, 24473.0], [97.2, 24499.0], [97.3, 24506.0], [97.4, 24516.0], [97.5, 24531.0], [97.6, 24555.0], [97.7, 24578.0], [97.8, 24596.0], [97.9, 24610.0], [98.0, 24619.0], [98.1, 24627.0], [98.2, 24637.0], [98.3, 24645.0], [98.4, 24654.0], [98.5, 24659.0], [98.6, 24674.0], [98.7, 24684.0], [98.8, 24713.0], [98.9, 24719.0], [99.0, 24767.0], [99.1, 24775.0], [99.2, 24810.0], [99.3, 24823.0], [99.4, 24847.0], [99.5, 24891.0], [99.6, 24966.0], [99.7, 25002.0], [99.8, 25053.0], [99.9, 25106.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 45.0, "series": [{"data": [[500.0, 6.0], [600.0, 3.0], [700.0, 9.0], [800.0, 3.0], [900.0, 4.0], [1000.0, 3.0], [1100.0, 4.0], [1200.0, 3.0], [1300.0, 3.0], [1400.0, 1.0], [1600.0, 4.0], [1700.0, 2.0], [1800.0, 3.0], [1900.0, 1.0], [2000.0, 3.0], [2100.0, 2.0], [2200.0, 3.0], [2300.0, 2.0], [2400.0, 2.0], [2500.0, 1.0], [2600.0, 4.0], [2800.0, 1.0], [2700.0, 2.0], [2900.0, 2.0], [3000.0, 3.0], [3100.0, 6.0], [3300.0, 9.0], [3200.0, 5.0], [3400.0, 6.0], [3500.0, 3.0], [3700.0, 11.0], [3600.0, 9.0], [3800.0, 10.0], [3900.0, 11.0], [4000.0, 9.0], [4100.0, 19.0], [4200.0, 19.0], [4300.0, 16.0], [4500.0, 20.0], [4400.0, 17.0], [4600.0, 22.0], [4800.0, 22.0], [4700.0, 22.0], [4900.0, 30.0], [5000.0, 15.0], [5100.0, 15.0], [5200.0, 18.0], [5300.0, 20.0], [5600.0, 17.0], [5500.0, 15.0], [5400.0, 12.0], [5700.0, 18.0], [5800.0, 18.0], [6100.0, 10.0], [6000.0, 8.0], [5900.0, 16.0], [6300.0, 10.0], [6200.0, 10.0], [6400.0, 16.0], [6600.0, 6.0], [6500.0, 11.0], [6700.0, 4.0], [6800.0, 9.0], [6900.0, 18.0], [7000.0, 9.0], [7100.0, 13.0], [7300.0, 11.0], [7200.0, 13.0], [7400.0, 11.0], [7500.0, 14.0], [7600.0, 8.0], [7800.0, 12.0], [7700.0, 6.0], [7900.0, 11.0], [8000.0, 14.0], [8100.0, 15.0], [8300.0, 18.0], [8200.0, 7.0], [8700.0, 25.0], [8600.0, 11.0], [8500.0, 15.0], [8400.0, 15.0], [8900.0, 13.0], [9200.0, 11.0], [8800.0, 18.0], [9100.0, 12.0], [9000.0, 10.0], [9300.0, 14.0], [9600.0, 15.0], [9700.0, 11.0], [9400.0, 12.0], [9500.0, 11.0], [9800.0, 22.0], [9900.0, 19.0], [10200.0, 24.0], [10100.0, 22.0], [10000.0, 19.0], [10300.0, 18.0], [10400.0, 12.0], [10600.0, 24.0], [10500.0, 18.0], [10700.0, 18.0], [10800.0, 17.0], [10900.0, 17.0], [11200.0, 14.0], [11000.0, 17.0], [11100.0, 5.0], [11600.0, 11.0], [11300.0, 7.0], [11400.0, 9.0], [11700.0, 12.0], [11500.0, 12.0], [12100.0, 8.0], [12000.0, 11.0], [11800.0, 9.0], [12200.0, 7.0], [11900.0, 6.0], [12300.0, 5.0], [12600.0, 10.0], [12500.0, 14.0], [12400.0, 8.0], [12700.0, 10.0], [12900.0, 13.0], [13300.0, 15.0], [13000.0, 16.0], [12800.0, 12.0], [13100.0, 10.0], [13200.0, 5.0], [13400.0, 12.0], [13500.0, 12.0], [13600.0, 15.0], [13800.0, 15.0], [13700.0, 7.0], [13900.0, 15.0], [14000.0, 11.0], [14100.0, 12.0], [14200.0, 11.0], [14300.0, 17.0], [14400.0, 7.0], [14500.0, 6.0], [14600.0, 11.0], [14700.0, 12.0], [14800.0, 13.0], [14900.0, 12.0], [15100.0, 10.0], [15200.0, 8.0], [15300.0, 10.0], [15000.0, 11.0], [15500.0, 12.0], [15700.0, 8.0], [15800.0, 6.0], [15400.0, 5.0], [15600.0, 3.0], [15900.0, 8.0], [16000.0, 7.0], [16100.0, 12.0], [16300.0, 6.0], [16200.0, 9.0], [16600.0, 7.0], [17400.0, 7.0], [16400.0, 10.0], [16800.0, 10.0], [17000.0, 8.0], [17200.0, 6.0], [18200.0, 5.0], [18400.0, 8.0], [17600.0, 5.0], [17800.0, 10.0], [18000.0, 9.0], [18600.0, 9.0], [18800.0, 16.0], [19200.0, 19.0], [19000.0, 14.0], [19400.0, 13.0], [19800.0, 11.0], [20400.0, 16.0], [20000.0, 15.0], [20200.0, 13.0], [19600.0, 12.0], [20600.0, 22.0], [20800.0, 16.0], [21000.0, 27.0], [21200.0, 14.0], [21400.0, 18.0], [22000.0, 6.0], [21600.0, 16.0], [22400.0, 11.0], [22200.0, 7.0], [21800.0, 11.0], [22600.0, 13.0], [23400.0, 12.0], [22800.0, 14.0], [23200.0, 17.0], [23000.0, 19.0], [23600.0, 26.0], [24000.0, 30.0], [23800.0, 21.0], [24200.0, 34.0], [24400.0, 20.0], [24600.0, 27.0], [24800.0, 11.0], [25000.0, 7.0], [16900.0, 10.0], [16500.0, 13.0], [16700.0, 11.0], [17100.0, 6.0], [17300.0, 5.0], [17900.0, 7.0], [18100.0, 6.0], [18300.0, 7.0], [17500.0, 5.0], [17700.0, 5.0], [18500.0, 10.0], [18700.0, 11.0], [18900.0, 13.0], [19300.0, 13.0], [19100.0, 16.0], [20300.0, 15.0], [20100.0, 14.0], [19500.0, 8.0], [19700.0, 12.0], [19900.0, 17.0], [20700.0, 21.0], [20500.0, 19.0], [20900.0, 22.0], [21100.0, 18.0], [21300.0, 15.0], [21500.0, 22.0], [21700.0, 14.0], [22100.0, 6.0], [21900.0, 18.0], [22300.0, 11.0], [22500.0, 10.0], [22900.0, 17.0], [23100.0, 18.0], [22700.0, 21.0], [23300.0, 21.0], [23500.0, 18.0], [23700.0, 22.0], [24100.0, 45.0], [23900.0, 35.0], [24300.0, 23.0], [24500.0, 19.0], [25100.0, 3.0], [24700.0, 12.0], [24900.0, 4.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 25100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 39.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2961.0, "series": [{"data": [[1.0, 39.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2961.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 1343.1926666666661, "minX": 1.54958346E12, "maxY": 1343.1926666666661, "series": [{"data": [[1.54958346E12, 1343.1926666666661]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 789.0, "minX": 1.0, "maxY": 25180.0, "series": [{"data": [[2.0, 24391.0], [3.0, 24195.0], [4.0, 24847.0], [5.0, 24513.0], [6.0, 24742.0], [7.0, 24516.0], [8.0, 24680.0], [9.0, 24179.0], [10.0, 24891.0], [11.0, 24166.0], [12.0, 24285.0], [13.0, 24188.0], [15.0, 24435.0], [16.0, 24460.0], [18.0, 24470.0], [19.0, 25053.0], [21.0, 24231.5], [22.0, 24383.0], [24.0, 24404.5], [25.0, 24175.0], [26.0, 24386.0], [27.0, 24195.0], [29.0, 24203.5], [30.0, 24155.0], [31.0, 24713.0], [33.0, 24645.0], [32.0, 24175.0], [35.0, 24363.0], [34.0, 24466.0], [37.0, 24171.0], [36.0, 24652.0], [39.0, 24268.0], [38.0, 24208.0], [41.0, 24753.5], [43.0, 24122.0], [42.0, 24112.0], [45.0, 24715.0], [44.0, 24938.0], [47.0, 25180.0], [46.0, 24464.0], [49.0, 24094.0], [48.0, 24610.0], [51.0, 25002.0], [50.0, 24619.0], [53.0, 24262.0], [52.0, 25048.0], [55.0, 24814.0], [54.0, 24796.0], [57.0, 24674.0], [56.0, 24439.0], [59.0, 24390.5], [61.0, 24655.0], [60.0, 24719.0], [63.0, 24907.0], [62.0, 24055.0], [67.0, 24498.5], [65.0, 24174.0], [64.0, 24421.0], [71.0, 24403.0], [70.0, 24145.0], [69.0, 24637.0], [68.0, 24109.0], [75.0, 24616.0], [74.0, 24312.0], [73.0, 24146.0], [72.0, 24368.0], [79.0, 24200.0], [78.0, 24852.0], [77.0, 25056.0], [76.0, 24204.0], [83.0, 24108.0], [82.0, 24673.0], [81.0, 24057.0], [80.0, 24061.0], [87.0, 24377.0], [86.0, 24379.0], [85.0, 24293.0], [84.0, 24635.0], [91.0, 24240.0], [90.0, 25008.0], [89.0, 25000.0], [88.0, 24966.0], [95.0, 24270.0], [94.0, 24151.0], [93.0, 24269.0], [92.0, 24831.0], [99.0, 24773.0], [98.0, 24233.0], [97.0, 24069.0], [96.0, 24016.0], [103.0, 24103.0], [102.0, 24659.0], [101.0, 24210.0], [100.0, 24219.0], [107.0, 23948.0], [106.0, 24087.0], [105.0, 24555.0], [104.0, 24261.0], [110.0, 24198.0], [109.0, 23988.0], [108.0, 24829.0], [115.0, 24974.0], [114.0, 24462.0], [113.0, 24823.0], [112.0, 24036.5], [119.0, 24088.0], [118.0, 24815.0], [117.0, 24014.0], [116.0, 24306.0], [123.0, 24243.0], [122.0, 24127.0], [121.0, 24119.0], [120.0, 24144.0], [127.0, 24648.0], [126.0, 23960.0], [125.0, 23971.0], [124.0, 23904.0], [135.0, 24233.0], [134.0, 24088.0], [133.0, 24807.0], [132.0, 23920.0], [131.0, 24263.0], [130.0, 23927.0], [129.0, 24713.0], [128.0, 24884.0], [139.0, 8558.0], [143.0, 24552.0], [142.0, 24333.0], [141.0, 23978.0], [140.0, 24492.0], [138.0, 24608.0], [137.0, 24098.0], [136.0, 24354.0], [145.0, 8435.0], [151.0, 24627.0], [150.0, 24171.0], [149.0, 24743.0], [148.0, 24502.0], [147.0, 24334.0], [144.0, 24012.0], [154.0, 12613.5], [159.0, 24658.0], [158.0, 24810.0], [157.0, 24160.0], [156.0, 24289.0], [155.0, 24574.0], [153.0, 23979.0], [152.0, 24174.0], [166.0, 12229.5], [167.0, 24136.0], [165.0, 24430.0], [164.0, 24089.0], [163.0, 23778.0], [162.0, 23987.0], [161.0, 24554.0], [160.0, 24664.0], [175.0, 23863.0], [174.0, 23809.0], [173.0, 24288.0], [172.0, 24267.0], [171.0, 23847.0], [170.0, 23873.0], [169.0, 24581.0], [168.0, 24146.0], [183.0, 24596.0], [182.0, 24394.0], [181.0, 24353.0], [180.0, 24223.0], [179.0, 24630.0], [178.0, 23957.0], [177.0, 24296.0], [176.0, 24115.0], [185.0, 12444.5], [190.0, 12367.5], [191.0, 24585.0], [189.0, 24654.0], [188.0, 23716.0], [187.0, 24775.0], [186.0, 23900.0], [184.0, 24506.0], [196.0, 12586.5], [199.0, 12378.0], [198.0, 24225.0], [197.0, 24682.0], [195.0, 24769.0], [194.0, 23943.0], [193.0, 24499.0], [192.0, 24081.0], [201.0, 12355.0], [207.0, 23910.0], [206.0, 24009.0], [205.0, 23815.0], [204.0, 24574.0], [203.0, 23719.0], [202.0, 23675.0], [200.0, 24165.0], [213.0, 12719.5], [215.0, 16401.666666666668], [212.0, 23943.0], [211.0, 23928.0], [210.0, 24578.0], [209.0, 23947.0], [208.0, 23928.0], [218.0, 12318.0], [223.0, 23951.0], [222.0, 23790.0], [221.0, 23792.0], [220.0, 23967.0], [219.0, 23980.0], [217.0, 23968.0], [216.0, 23968.0], [225.0, 789.0], [231.0, 24172.0], [230.0, 23738.0], [229.0, 24283.0], [228.0, 24504.0], [227.0, 24531.0], [226.0, 23863.5], [224.0, 23894.0], [239.0, 23647.0], [238.0, 23864.0], [237.0, 24123.0], [236.0, 23604.0], [235.0, 23755.5], [233.0, 24402.0], [232.0, 23738.0], [247.0, 24065.0], [246.0, 23781.0], [245.0, 23700.0], [244.0, 24138.0], [243.0, 24207.0], [242.0, 24372.0], [241.0, 24329.0], [240.0, 24520.0], [251.0, 12293.5], [252.0, 12221.0], [255.0, 23692.0], [254.0, 24052.0], [253.0, 23540.0], [250.0, 25106.0], [249.0, 23566.0], [248.0, 24395.0], [271.0, 23720.0], [262.0, 12806.5], [261.0, 24131.0], [260.0, 23496.0], [269.0, 12554.0], [270.0, 24198.0], [268.0, 23975.0], [259.0, 24127.0], [258.0, 24185.0], [257.0, 23450.0], [256.0, 23747.0], [263.0, 23744.0], [267.0, 23743.0], [266.0, 24352.0], [265.0, 23691.0], [264.0, 25111.0], [287.0, 23617.0], [275.0, 12514.0], [279.0, 23680.0], [272.0, 23844.0], [274.0, 23897.0], [273.0, 24234.0], [278.0, 23993.0], [277.0, 23451.0], [276.0, 24013.0], [282.0, 8400.0], [286.0, 23846.0], [285.0, 23915.0], [284.0, 23984.0], [283.0, 24483.0], [281.0, 23885.0], [280.0, 23669.0], [302.0, 24213.0], [303.0, 23293.0], [301.0, 23561.0], [300.0, 23480.0], [299.0, 23568.0], [298.0, 23320.0], [297.0, 24005.0], [296.0, 23932.0], [295.0, 24049.0], [289.0, 24139.0], [288.0, 23314.0], [291.0, 23610.0], [290.0, 23314.0], [294.0, 24292.0], [293.0, 23578.0], [292.0, 23758.0], [319.0, 24514.0], [305.0, 12215.5], [308.0, 12765.0], [309.0, 24465.0], [311.0, 23735.0], [304.0, 23754.0], [310.0, 23818.0], [314.0, 12560.5], [318.0, 12246.5], [317.0, 23247.0], [316.0, 23352.0], [307.0, 24088.0], [306.0, 24385.0], [315.0, 23371.0], [313.0, 23938.0], [312.0, 23469.0], [334.0, 24473.0], [335.0, 23943.0], [333.0, 24164.0], [332.0, 23578.0], [331.0, 23474.0], [330.0, 23669.0], [329.0, 23159.0], [328.0, 23160.0], [327.0, 23070.0], [321.0, 23629.0], [320.0, 23651.0], [323.0, 23599.0], [322.0, 24456.0], [326.0, 23710.0], [325.0, 23819.0], [324.0, 23377.0], [351.0, 23170.0], [341.0, 12494.0], [340.0, 12733.5], [344.0, 12362.5], [345.0, 22993.0], [350.0, 23656.0], [349.0, 23646.0], [348.0, 23217.0], [339.0, 23711.0], [338.0, 23566.0], [337.0, 23294.0], [336.0, 23747.0], [343.0, 23245.0], [342.0, 23259.0], [347.0, 23221.0], [346.0, 23230.0], [366.0, 24000.0], [367.0, 23668.0], [365.0, 23476.0], [364.0, 23801.0], [363.0, 22902.0], [362.0, 23727.0], [361.0, 23001.0], [360.0, 23569.0], [359.0, 23437.0], [353.0, 23998.0], [352.0, 23337.0], [355.0, 22986.0], [354.0, 23107.0], [358.0, 23541.0], [357.0, 23294.0], [356.0, 23338.0], [382.0, 23152.0], [375.0, 12039.5], [369.0, 22973.0], [368.0, 23386.0], [371.0, 23100.0], [370.0, 23061.0], [374.0, 23197.0], [373.0, 23051.0], [372.0, 23596.0], [383.0, 12406.0], [381.0, 24261.0], [380.0, 22908.0], [379.0, 24467.0], [378.0, 23507.0], [377.0, 23174.0], [376.0, 23158.0], [398.0, 22983.0], [399.0, 24280.0], [397.0, 23372.0], [396.0, 23334.0], [395.0, 23221.0], [394.0, 24284.0], [393.0, 23675.0], [392.0, 22777.0], [391.0, 23178.0], [385.0, 23174.0], [384.0, 22942.0], [387.0, 23605.0], [386.0, 23099.0], [390.0, 23063.0], [389.0, 23069.0], [388.0, 24041.0], [414.0, 22932.0], [415.0, 12633.5], [413.0, 23901.0], [412.0, 23266.0], [411.0, 23335.0], [410.0, 23059.0], [409.0, 22760.0], [408.0, 22897.0], [407.0, 23092.0], [401.0, 22693.0], [400.0, 22831.0], [403.0, 24009.0], [402.0, 23202.0], [406.0, 23000.0], [405.0, 22997.0], [404.0, 23136.0], [430.0, 22778.0], [429.0, 12059.5], [431.0, 23656.0], [428.0, 23137.0], [426.0, 23092.0], [425.0, 23630.0], [424.0, 23310.0], [423.0, 22561.0], [417.0, 23623.0], [416.0, 22434.0], [419.0, 22677.0], [418.0, 22703.0], [422.0, 22879.0], [421.0, 23182.0], [420.0, 22598.0], [446.0, 23307.0], [447.0, 22897.0], [445.0, 23216.0], [444.0, 22490.0], [443.0, 23171.0], [442.0, 22891.0], [441.0, 22796.0], [440.0, 22803.0], [439.0, 23013.0], [433.0, 22845.0], [432.0, 23816.0], [435.0, 22772.0], [434.0, 23243.0], [438.0, 23762.0], [437.0, 23083.0], [436.0, 23368.0], [462.0, 22341.0], [463.0, 22661.0], [461.0, 22790.0], [460.0, 22847.0], [459.0, 23376.0], [458.0, 23338.0], [457.0, 22711.0], [456.0, 22763.0], [455.0, 23180.0], [449.0, 22440.0], [448.0, 23184.0], [451.0, 22610.0], [450.0, 22780.0], [454.0, 23555.0], [453.0, 22725.0], [452.0, 22900.0], [478.0, 22750.0], [466.0, 12152.0], [465.0, 22728.0], [464.0, 22962.0], [471.0, 23038.0], [470.0, 22605.0], [469.0, 23010.0], [468.0, 23398.0], [467.0, 8573.333333333332], [479.0, 22781.0], [477.0, 23663.0], [476.0, 23538.0], [475.0, 22551.0], [474.0, 22205.0], [473.0, 22596.0], [472.0, 22450.0], [494.0, 23292.0], [495.0, 23483.0], [493.0, 22610.0], [492.0, 22579.0], [491.0, 22536.0], [490.0, 22368.0], [489.0, 22466.0], [488.0, 23049.0], [487.0, 22890.0], [481.0, 23641.0], [480.0, 23085.0], [483.0, 22961.0], [482.0, 22504.0], [486.0, 22784.0], [485.0, 22560.0], [484.0, 22907.0], [510.0, 22898.0], [509.0, 11871.5], [511.0, 22733.0], [508.0, 22841.0], [507.0, 22539.0], [506.0, 22475.0], [505.0, 22312.0], [504.0, 23291.0], [503.0, 22719.0], [497.0, 22830.0], [496.0, 22759.0], [499.0, 22826.0], [498.0, 22964.0], [502.0, 22798.0], [501.0, 22225.0], [500.0, 22681.0], [540.0, 22223.0], [542.0, 21785.0], [538.0, 21945.0], [536.0, 22224.0], [534.0, 22059.0], [532.0, 22342.0], [530.0, 21902.0], [528.0, 21601.0], [526.0, 21554.0], [514.0, 22454.0], [512.0, 22881.0], [518.0, 22617.0], [516.0, 22466.5], [524.0, 22301.0], [522.0, 21907.0], [520.0, 22322.0], [572.0, 22240.0], [574.0, 21944.0], [570.0, 21684.0], [568.0, 21827.0], [566.0, 21893.0], [564.0, 21461.0], [562.0, 21638.0], [560.0, 21578.0], [556.0, 22140.0], [546.0, 21790.5], [544.0, 22061.0], [550.0, 21498.0], [548.0, 21841.0], [554.0, 21129.0], [552.0, 21955.0], [604.0, 21596.0], [606.0, 21052.0], [602.0, 21890.0], [600.0, 21075.0], [598.0, 21724.0], [596.0, 21994.0], [594.0, 21914.0], [592.0, 21302.0], [590.0, 21658.0], [578.0, 20700.0], [576.0, 21783.0], [582.0, 20933.0], [580.0, 21468.0], [588.0, 21452.0], [586.0, 21375.0], [584.0, 21822.0], [638.0, 21025.0], [616.0, 11440.0], [620.0, 20910.0], [618.0, 21340.0], [624.0, 11654.0], [636.0, 21290.0], [634.0, 21457.0], [632.0, 21027.0], [614.0, 21102.0], [612.0, 21402.0], [610.0, 21442.0], [608.0, 21781.0], [622.0, 21193.0], [630.0, 21206.0], [628.0, 21243.0], [626.0, 21206.0], [670.0, 20866.0], [656.0, 11585.0], [668.0, 21228.0], [666.0, 20855.0], [662.0, 20671.0], [660.0, 21042.0], [658.0, 20955.0], [654.0, 21195.0], [642.0, 20864.0], [640.0, 20922.0], [646.0, 21069.0], [644.0, 21578.0], [652.0, 21087.0], [650.0, 21498.0], [648.0, 21594.0], [700.0, 20600.0], [702.0, 20651.0], [696.0, 21050.0], [678.0, 21383.0], [676.0, 20750.0], [674.0, 21234.0], [672.0, 21124.0], [694.0, 20583.0], [692.0, 20575.0], [690.0, 21061.0], [688.0, 20719.0], [686.0, 21174.0], [684.0, 20816.0], [680.0, 21057.0], [734.0, 20188.0], [708.0, 11465.5], [718.0, 20482.0], [706.0, 20376.0], [704.0, 20450.0], [716.0, 20448.0], [714.0, 21002.0], [712.0, 21073.0], [722.0, 11003.0], [732.0, 20800.0], [730.0, 20490.0], [728.0, 20502.0], [710.0, 21000.0], [726.0, 20303.0], [724.0, 20903.0], [720.0, 20640.0], [762.0, 20144.0], [736.0, 1894.0], [766.0, 23319.0], [760.0, 20238.0], [742.0, 20019.0], [740.0, 20569.0], [738.0, 20227.0], [758.0, 20131.0], [756.0, 20471.0], [754.0, 20685.0], [752.0, 20026.0], [750.0, 19868.0], [748.0, 20297.0], [746.0, 20277.0], [744.0, 20136.0], [796.0, 21499.0], [768.0, 11084.0], [770.0, 20397.0], [774.0, 20123.0], [772.0, 20026.0], [782.0, 20057.0], [780.0, 21619.0], [778.0, 20217.0], [776.0, 20216.0], [798.0, 21717.0], [794.0, 20102.0], [792.0, 19669.0], [790.0, 19772.0], [788.0, 20146.0], [786.0, 22012.0], [784.0, 23380.0], [828.0, 19317.0], [802.0, 11037.5], [800.0, 19879.0], [806.0, 21079.0], [804.0, 19256.0], [814.0, 19878.0], [812.0, 22694.0], [810.0, 19677.0], [808.0, 21580.0], [830.0, 19429.0], [826.0, 18943.0], [824.0, 19753.0], [822.0, 22345.0], [820.0, 21579.0], [818.0, 19481.0], [816.0, 22760.0], [860.0, 11452.5], [834.0, 10755.0], [832.0, 21377.5], [838.0, 21445.0], [836.0, 19420.0], [846.0, 19516.0], [844.0, 22201.0], [842.0, 19428.0], [840.0, 21495.0], [862.0, 20950.0], [858.0, 20806.0], [856.0, 19154.0], [854.0, 20541.0], [852.0, 21326.0], [850.0, 20656.0], [848.0, 20550.0], [892.0, 18937.0], [894.0, 18720.0], [890.0, 22080.0], [888.0, 18726.0], [886.0, 20693.0], [884.0, 19039.0], [882.0, 18750.0], [880.0, 19079.0], [878.0, 21003.0], [866.0, 19028.0], [864.0, 19195.0], [870.0, 20909.0], [868.0, 19928.0], [876.0, 20268.0], [874.0, 20496.0], [872.0, 18978.0], [924.0, 19044.0], [900.0, 11483.0], [898.0, 20261.0], [896.0, 19367.0], [902.0, 20809.0], [910.0, 22195.0], [908.0, 20684.0], [906.0, 18851.0], [904.0, 21549.0], [926.0, 18511.0], [922.0, 20483.0], [920.0, 19830.0], [918.0, 20645.0], [916.0, 19759.0], [914.0, 18965.0], [912.0, 22179.0], [956.0, 20322.0], [958.0, 22025.0], [954.0, 19144.0], [952.0, 21626.0], [950.0, 20444.0], [948.0, 20419.0], [946.0, 19679.0], [944.0, 21697.0], [942.0, 21533.0], [930.0, 20572.0], [928.0, 18867.0], [934.0, 20517.0], [932.0, 18623.0], [940.0, 19117.0], [938.0, 18851.0], [988.0, 18512.0], [990.0, 18492.0], [986.0, 19257.0], [984.0, 18619.0], [982.0, 20062.0], [980.0, 21101.0], [978.0, 19465.0], [976.0, 20147.0], [974.0, 18811.0], [962.0, 20065.0], [960.0, 21518.0], [966.0, 19735.0], [964.0, 18329.0], [972.0, 18951.0], [970.0, 19975.0], [968.0, 18648.0], [994.0, 19985.0], [992.0, 10878.0], [996.0, 20765.0], [1016.0, 19098.0], [998.0, 18748.0], [1018.0, 19358.0], [1000.0, 18198.0], [1002.0, 20971.0], [1004.0, 19804.0], [1006.0, 19451.0], [1012.0, 20846.0], [1010.0, 19087.5], [1008.0, 18562.0], [1014.0, 18007.0], [1022.0, 19720.0], [1020.0, 21216.0], [1080.0, 20902.0], [1056.0, 20843.0], [1060.0, 18879.0], [1064.0, 18186.0], [1084.0, 20846.0], [1076.0, 20660.0], [1072.0, 17445.0], [1024.0, 19713.0], [1028.0, 19667.0], [1032.0, 19236.0], [1036.0, 18366.0], [1052.0, 19116.0], [1048.0, 18551.0], [1044.0, 19542.0], [1040.0, 19604.0], [1068.0, 18806.0], [1096.0, 10476.5], [1100.0, 10891.5], [1092.0, 20561.0], [1088.0, 18539.0], [1136.0, 18055.0], [1140.0, 17880.0], [1144.0, 17880.0], [1148.0, 8071.333333333333], [1108.0, 8895.333333333332], [1104.0, 20578.0], [1112.0, 3309.0], [1116.0, 17827.0], [1120.0, 10143.0], [1124.0, 10279.0], [1128.0, 18307.0], [1132.0, 16875.0], [1208.0, 16992.0], [1184.0, 16459.0], [1188.0, 17416.0], [1192.0, 16708.0], [1212.0, 18481.0], [1204.0, 16465.0], [1200.0, 17304.0], [1152.0, 18102.0], [1156.0, 17495.0], [1160.0, 18033.0], [1164.0, 17042.0], [1180.0, 16595.0], [1176.0, 16480.0], [1172.0, 17912.0], [1168.0, 16953.0], [1196.0, 16297.0], [1272.0, 15677.0], [1248.0, 15940.0], [1252.0, 16841.0], [1256.0, 17973.0], [1276.0, 15553.0], [1268.0, 15398.0], [1264.0, 16951.0], [1216.0, 17009.0], [1220.0, 18279.0], [1224.0, 18166.0], [1228.0, 16135.0], [1244.0, 15959.0], [1240.0, 18548.0], [1236.0, 15542.0], [1232.0, 18638.0], [1260.0, 15452.0], [1336.0, 14807.0], [1312.0, 16276.0], [1316.0, 16293.0], [1320.0, 16266.0], [1340.0, 14941.0], [1332.0, 16091.0], [1328.0, 14525.0], [1280.0, 16712.0], [1284.0, 16729.0], [1288.0, 16567.0], [1292.0, 16452.0], [1308.0, 16388.0], [1304.0, 15180.0], [1300.0, 15146.0], [1296.0, 16720.0], [1324.0, 14631.0], [1400.0, 14141.0], [1376.0, 14336.0], [1380.0, 15366.0], [1384.0, 14042.0], [1404.0, 15038.0], [1396.0, 15254.0], [1392.0, 14417.0], [1372.0, 15349.0], [1344.0, 14381.0], [1348.0, 14881.0], [1352.0, 16923.0], [1356.0, 14378.0], [1368.0, 14356.0], [1364.0, 15471.0], [1360.0, 15094.0], [1388.0, 14570.0], [1464.0, 13444.0], [1440.0, 14119.0], [1444.0, 15181.0], [1448.0, 14178.0], [1468.0, 14627.0], [1460.0, 14382.0], [1456.0, 15169.0], [1408.0, 14350.0], [1412.0, 15025.0], [1416.0, 13798.0], [1420.0, 15055.0], [1436.0, 14131.0], [1432.0, 13572.0], [1428.0, 14847.0], [1424.0, 14995.0], [1452.0, 13856.0], [1532.0, 8929.5], [1512.0, 6791.666666666666], [1508.0, 14666.0], [1504.0, 13022.0], [1516.0, 14563.0], [1528.0, 13652.0], [1524.0, 14256.0], [1520.0, 13211.0], [1484.0, 13618.0], [1480.0, 14405.0], [1476.0, 14964.0], [1472.0, 14955.0], [1500.0, 13801.0], [1496.0, 14747.0], [1492.0, 13319.0], [1488.0, 14813.0], [1596.0, 12345.0], [1588.0, 12554.0], [1568.0, 7272.0], [1576.0, 6791.0], [1572.0, 12830.0], [1580.0, 12621.0], [1556.0, 14213.0], [1552.0, 13281.0], [1560.0, 8902.0], [1536.0, 13947.0], [1540.0, 13113.0], [1544.0, 13919.5], [1564.0, 13795.0], [1584.0, 13499.0], [1592.0, 12349.0], [1608.0, 12061.0], [1652.0, 7747.5], [1648.0, 11743.0], [1612.0, 12865.0], [1604.0, 12821.0], [1624.0, 8462.0], [1620.0, 13601.0], [1616.0, 13624.0], [1600.0, 13808.0], [1628.0, 12528.0], [1636.0, 11807.0], [1640.0, 12299.0], [1644.0, 13454.0], [1632.0, 12735.0], [1656.0, 11840.0], [1672.0, 11796.0], [1692.0, 8573.0], [1664.0, 13362.0], [1668.0, 12198.0], [1704.0, 7937.0], [1696.0, 13015.0], [1700.0, 12664.0], [1724.0, 11350.0], [1720.0, 10728.0], [1716.0, 11029.0], [1712.0, 10770.0], [1676.0, 12949.0], [1688.0, 8611.5], [1684.0, 13076.0], [1680.0, 12419.0], [1708.0, 12549.0], [1736.0, 8064.5], [1776.0, 7817.5], [1728.0, 11013.0], [1732.0, 11493.0], [1740.0, 7523.5], [1788.0, 7961.0], [1784.0, 11588.0], [1780.0, 11554.0], [1744.0, 7158.0], [1748.0, 10679.0], [1752.0, 11284.0], [1756.0, 6880.333333333334], [1768.0, 5916.75], [1764.0, 10194.0], [1760.0, 10921.0], [1772.0, 11661.0], [1796.0, 11363.0], [1804.0, 7409.5], [1792.0, 12224.0], [1800.0, 10686.0], [1820.0, 11078.0], [1816.0, 10511.0], [1812.0, 12268.0], [1808.0, 11263.0], [1848.0, 6062.0], [1824.0, 10077.0], [1828.0, 10955.0], [1832.0, 10297.0], [1836.0, 12004.0], [1852.0, 10093.0], [1844.0, 10237.0], [1840.0, 11876.0], [1864.0, 10616.0], [1876.0, 6482.0], [1856.0, 9807.0], [1860.0, 12124.0], [1884.0, 10303.0], [1880.0, 12362.0], [1868.0, 9723.0], [1892.0, 6306.0], [1896.0, 10991.0], [1900.0, 10253.0], [1888.0, 10250.0], [1912.0, 10108.0], [1916.0, 10064.0], [1904.0, 11290.0], [1908.0, 10111.0], [1872.0, 6783.5], [1968.0, 7561.5], [1972.0, 7457.0], [1920.0, 7598.0], [1924.0, 9963.0], [1928.0, 10947.0], [1932.0, 6856.5], [1952.0, 8943.0], [1980.0, 8601.0], [1976.0, 8886.0], [1956.0, 9661.0], [1960.0, 8174.0], [1964.0, 10601.0], [1948.0, 6772.333333333334], [1944.0, 9233.0], [1940.0, 9180.0], [1936.0, 9866.0], [1992.0, 9424.0], [1996.0, 10540.0], [1984.0, 7054.5], [2012.0, 9258.0], [1988.0, 5774.6], [2000.0, 6248.0], [2016.0, 6278.5], [2040.0, 10351.0], [2044.0, 8939.0], [2036.0, 9995.0], [2032.0, 6145.666666666667], [2024.0, 9138.0], [2028.0, 10310.0], [2020.0, 6838.5], [2004.0, 10424.0], [2008.0, 7536.0], [2048.0, 10866.0], [2096.0, 10037.0], [2104.0, 9773.0], [2088.0, 5491.0], [2080.0, 8777.0], [2056.0, 10726.0], [2064.0, 4330.0], [2072.0, 10604.0], [2112.0, 7321.5], [2168.0, 8081.0], [2160.0, 8153.0], [2144.0, 7258.5], [2152.0, 9693.0], [2120.0, 7593.0], [2128.0, 9927.0], [2136.0, 6701.0], [2232.0, 8568.0], [2216.0, 9364.0], [2208.0, 6951.0], [2224.0, 8566.0], [2176.0, 7459.0], [2184.0, 7600.5], [2192.0, 5620.25], [2200.0, 7757.0], [2272.0, 6842.0], [2296.0, 6283.0], [2288.0, 8645.0], [2280.0, 8026.0], [2240.0, 6980.5], [2248.0, 8763.0], [2256.0, 6807.0], [2264.0, 5333.0], [2408.0, 6493.0], [2312.0, 6804.5], [2304.0, 8549.0], [2320.0, 8707.0], [2360.0, 6083.5], [2416.0, 7024.0], [2424.0, 6488.0], [2368.0, 7323.0], [2400.0, 6537.0], [2328.0, 7521.0], [2392.0, 7190.0], [2384.0, 7358.0], [2376.0, 7598.0], [2336.0, 7947.0], [2352.0, 6679.0], [2344.0, 7899.0], [2488.0, 5687.0], [2432.0, 6482.0], [2480.0, 6445.0], [2472.0, 6531.0], [2464.0, 5994.0], [2440.0, 6141.0], [2448.0, 6258.0], [2456.0, 6394.0], [2496.0, 5808.0], [2057.0, 10589.0], [2097.0, 5270.333333333333], [2049.0, 8956.0], [2105.0, 9581.0], [2089.0, 10025.0], [2081.0, 8729.0], [2065.0, 7496.25], [2169.0, 9090.0], [2113.0, 9426.0], [2161.0, 6506.666666666667], [2145.0, 6666.0], [2073.0, 8088.0], [2153.0, 9607.0], [2121.0, 8481.0], [2129.0, 10106.0], [2137.0, 10089.0], [2177.0, 7420.0], [2185.0, 7279.5], [2233.0, 7303.5], [2225.0, 8152.0], [2217.0, 8820.0], [2209.0, 8572.0], [2193.0, 5854.0], [2201.0, 8413.0], [2273.0, 8359.0], [2281.0, 8774.0], [2241.0, 8830.0], [2289.0, 8172.0], [2297.0, 8231.0], [2265.0, 8816.0], [2257.0, 8856.0], [2249.0, 6298.666666666667], [2321.0, 6870.5], [2353.0, 6113.25], [2313.0, 8556.0], [2305.0, 8757.0], [2361.0, 6189.666666666667], [2329.0, 8065.0], [2401.0, 6243.0], [2409.0, 6974.0], [2417.0, 5924.0], [2425.0, 6441.5], [2369.0, 7382.0], [2377.0, 6954.0], [2385.0, 7297.0], [2393.0, 6915.0], [2345.0, 7800.0], [2337.0, 7429.0], [2489.0, 6320.25], [2441.0, 6266.0], [2481.0, 6066.0], [2473.0, 5411.0], [2465.0, 6243.0], [2433.0, 6599.0], [2449.0, 6152.5], [2457.0, 6107.5], [2497.0, 6260.5], [1029.0, 17705.0], [1081.0, 20177.0], [1025.0, 8052.0], [1053.0, 18338.0], [1049.0, 18689.0], [1045.0, 20371.0], [1041.0, 18621.0], [1033.0, 11045.5], [1057.0, 19386.0], [1061.0, 17856.0], [1065.0, 18630.0], [1069.0, 17605.0], [1085.0, 19111.0], [1077.0, 20288.0], [1073.0, 19234.0], [1037.0, 20601.0], [1089.0, 19236.0], [1137.0, 19034.0], [1145.0, 6438.6], [1109.0, 20752.0], [1105.0, 19021.0], [1113.0, 19160.5], [1093.0, 17697.0], [1097.0, 17663.0], [1101.0, 19018.0], [1117.0, 18890.0], [1125.0, 10742.5], [1129.0, 17768.0], [1133.0, 16456.0], [1149.0, 16949.0], [1141.0, 17810.0], [1157.0, 16521.0], [1209.0, 18741.0], [1153.0, 7591.333333333333], [1161.0, 17992.0], [1165.0, 17399.0], [1181.0, 16910.0], [1177.0, 19223.0], [1173.0, 17894.0], [1169.0, 16609.0], [1185.0, 17332.0], [1189.0, 16109.0], [1193.0, 17714.0], [1197.0, 16220.0], [1213.0, 16447.0], [1205.0, 15926.0], [1201.0, 17603.0], [1273.0, 16778.0], [1249.0, 17004.0], [1253.0, 16610.0], [1257.0, 16875.0], [1277.0, 16874.0], [1269.0, 18594.0], [1265.0, 15263.0], [1217.0, 16564.0], [1221.0, 16093.0], [1225.0, 16974.0], [1229.0, 17317.0], [1245.0, 16889.0], [1241.0, 16781.0], [1237.0, 16512.0], [1233.0, 17262.0], [1261.0, 15777.0], [1337.0, 14746.0], [1313.0, 15786.0], [1317.0, 16103.0], [1321.0, 16337.0], [1341.0, 14700.0], [1333.0, 15395.0], [1329.0, 14602.0], [1281.0, 15485.0], [1285.0, 15805.0], [1289.0, 16818.0], [1293.0, 16501.0], [1309.0, 16288.0], [1305.0, 16549.0], [1301.0, 16291.0], [1297.0, 15511.0], [1325.0, 15014.0], [1401.0, 15172.0], [1377.0, 14300.0], [1381.0, 14055.0], [1385.0, 13952.0], [1405.0, 13936.0], [1397.0, 15588.0], [1393.0, 15563.0], [1345.0, 15873.0], [1349.0, 15747.0], [1353.0, 17435.0], [1357.0, 15952.0], [1373.0, 15319.0], [1369.0, 14307.0], [1365.0, 14218.0], [1361.0, 14801.0], [1389.0, 15241.0], [1465.0, 14655.0], [1441.0, 14443.0], [1445.0, 13628.0], [1449.0, 14365.0], [1469.0, 13728.0], [1461.0, 13693.0], [1457.0, 15123.0], [1409.0, 14063.0], [1413.0, 15387.0], [1421.0, 15375.0], [1437.0, 14985.0], [1433.0, 13525.0], [1429.0, 14984.0], [1425.0, 13670.0], [1453.0, 13877.0], [1529.0, 13511.0], [1505.0, 13529.0], [1509.0, 14157.0], [1513.0, 14432.0], [1533.0, 12747.0], [1525.0, 13945.0], [1521.0, 14059.0], [1473.0, 14932.0], [1477.0, 14908.0], [1481.0, 14393.0], [1485.0, 13372.0], [1501.0, 14365.0], [1497.0, 14744.0], [1493.0, 14728.0], [1489.0, 13174.0], [1517.0, 13170.0], [1541.0, 7323.0], [1561.0, 8324.5], [1537.0, 14307.0], [1565.0, 13805.0], [1549.0, 9942.333333333334], [1545.0, 14013.0], [1589.0, 12489.0], [1593.0, 12649.0], [1569.0, 13815.0], [1597.0, 13701.0], [1577.0, 14034.0], [1581.0, 12414.0], [1553.0, 12969.0], [1557.0, 14039.0], [1653.0, 5961.0], [1661.0, 12731.5], [1601.0, 8315.0], [1617.0, 7984.5], [1621.0, 12841.0], [1625.0, 12516.0], [1629.0, 12101.0], [1637.0, 7820.0], [1641.0, 8650.0], [1645.0, 12699.0], [1649.0, 13394.0], [1613.0, 12446.0], [1609.0, 12725.0], [1605.0, 13352.0], [1633.0, 12033.0], [1657.0, 13001.0], [1693.0, 11713.0], [1685.0, 13929.0], [1681.0, 11470.0], [1689.0, 7923.0], [1713.0, 11220.0], [1677.0, 11514.0], [1673.0, 12632.0], [1669.0, 13148.0], [1665.0, 12564.0], [1705.0, 7183.666666666666], [1697.0, 13050.0], [1701.0, 13081.0], [1725.0, 11720.0], [1721.0, 12180.0], [1717.0, 12047.0], [1733.0, 7591.0], [1785.0, 10277.0], [1729.0, 12109.0], [1737.0, 11045.0], [1777.0, 7898.0], [1741.0, 11547.0], [1781.0, 11583.0], [1789.0, 7635.0], [1745.0, 6734.333333333334], [1749.0, 11880.0], [1753.0, 10803.0], [1757.0, 12999.0], [1769.0, 5547.4], [1761.0, 10980.0], [1765.0, 10517.0], [1849.0, 7220.5], [1821.0, 7882.0], [1817.0, 7396.0], [1809.0, 11201.0], [1829.0, 7372.0], [1825.0, 10282.0], [1833.0, 9926.0], [1837.0, 10844.0], [1853.0, 10747.0], [1845.0, 12187.0], [1841.0, 10825.0], [1793.0, 11387.0], [1797.0, 10867.0], [1801.0, 10620.0], [1805.0, 10738.0], [1861.0, 9786.0], [1913.0, 11423.0], [1885.0, 11789.0], [1881.0, 10351.0], [1857.0, 11505.0], [1865.0, 10582.0], [1869.0, 10452.0], [1897.0, 6917.0], [1893.0, 11592.0], [1901.0, 10199.0], [1917.0, 11301.0], [1905.0, 10958.0], [1909.0, 9338.0], [1873.0, 6523.0], [1877.0, 6533.666666666667], [1929.0, 9852.0], [1925.0, 6816.5], [1921.0, 9381.0], [1949.0, 10486.0], [1933.0, 9885.0], [1973.0, 10527.0], [1981.0, 10563.0], [1977.0, 8989.0], [1969.0, 9636.0], [1953.0, 7609.5], [1957.0, 10635.0], [1961.0, 10866.0], [1965.0, 11294.0], [1945.0, 4587.0], [1941.0, 11057.0], [1937.0, 10795.0], [1993.0, 10248.0], [1985.0, 10291.0], [2009.0, 10082.0], [2013.0, 10305.0], [1997.0, 8339.0], [1989.0, 5992.8], [2001.0, 8742.0], [2017.0, 10901.0], [2041.0, 10801.0], [2045.0, 6280.25], [2037.0, 6817.666666666667], [2033.0, 10067.0], [2021.0, 6182.0], [2025.0, 10468.0], [2029.0, 10209.0], [2005.0, 10342.0], [2058.0, 7771.5], [2066.0, 7335.5], [2098.0, 6429.666666666667], [2106.0, 10191.0], [2090.0, 7847.0], [2082.0, 7586.0], [2050.0, 10328.0], [2074.0, 8799.0], [2114.0, 8540.0], [2170.0, 9416.0], [2162.0, 9433.0], [2146.0, 10268.0], [2154.0, 9087.0], [2130.0, 8355.0], [2122.0, 10148.0], [2178.0, 6465.333333333333], [2186.0, 8878.0], [2218.0, 8938.0], [2210.0, 9126.0], [2226.0, 7438.0], [2234.0, 8358.0], [2194.0, 5594.0], [2202.0, 7109.0], [2274.0, 8805.0], [2290.0, 7883.0], [2282.0, 6608.0], [2242.0, 8105.0], [2250.0, 5892.333333333333], [2258.0, 6190.0], [2266.0, 8994.0], [2402.0, 6207.333333333333], [2306.0, 8431.0], [2314.0, 8654.0], [2322.0, 8200.0], [2362.0, 6790.5], [2410.0, 6983.0], [2418.0, 6111.0], [2426.0, 6804.0], [2330.0, 7560.0], [2370.0, 6179.0], [2394.0, 7222.0], [2386.0, 7290.0], [2378.0, 6965.0], [2338.0, 6557.5], [2346.0, 7532.0], [2354.0, 7726.0], [2490.0, 5844.0], [2434.0, 6593.0], [2482.0, 5552.0], [2474.0, 5934.666666666667], [2466.0, 5863.0], [2442.0, 6203.0], [2450.0, 6822.0], [2458.0, 5880.0], [2498.0, 6208.0], [2051.0, 6410.666666666667], [2059.0, 10179.0], [2107.0, 9802.0], [2099.0, 9477.0], [2091.0, 7205.0], [2083.0, 6664.0], [2067.0, 10126.0], [2171.0, 6704.666666666667], [2115.0, 9931.0], [2163.0, 8079.0], [2075.0, 10642.0], [2147.0, 7606.0], [2155.0, 7651.0], [2123.0, 7175.5], [2131.0, 7487.0], [2139.0, 6761.0], [2187.0, 7514.5], [2179.0, 9879.0], [2235.0, 6804.0], [2227.0, 6240.75], [2219.0, 7535.0], [2211.0, 7056.0], [2203.0, 7051.0], [2195.0, 8521.5], [2275.0, 9275.0], [2283.0, 6554.666666666667], [2291.0, 8745.0], [2299.0, 8816.0], [2243.0, 6849.5], [2251.0, 6962.0], [2259.0, 5301.0], [2267.0, 8511.0], [2331.0, 8097.0], [2315.0, 6362.0], [2355.0, 7774.0], [2307.0, 8390.0], [2363.0, 7228.0], [2323.0, 8379.0], [2403.0, 6038.0], [2411.0, 6962.0], [2419.0, 6911.0], [2379.0, 7492.0], [2387.0, 7581.0], [2395.0, 7426.0], [2427.0, 6542.0], [2347.0, 6265.25], [2339.0, 7524.0], [2435.0, 6416.0], [2483.0, 6017.5], [2491.0, 6109.0], [2475.0, 6431.0], [2467.0, 5958.5], [2443.0, 6374.0], [2451.0, 6298.0], [2459.0, 7058.0], [2499.0, 6654.0], [541.0, 21794.0], [543.0, 21565.0], [539.0, 22378.0], [537.0, 21901.0], [533.0, 22499.0], [531.0, 21950.0], [529.0, 22481.0], [527.0, 21908.0], [513.0, 23453.0], [519.0, 21919.0], [517.0, 23112.0], [525.0, 22642.0], [523.0, 22460.0], [521.0, 21856.0], [573.0, 21721.0], [557.0, 11575.5], [555.0, 21260.0], [553.0, 21807.0], [559.0, 21748.5], [547.0, 21644.0], [551.0, 21558.0], [549.0, 21944.0], [575.0, 21491.0], [571.0, 22233.0], [569.0, 21521.0], [567.0, 21603.0], [565.0, 21733.0], [563.0, 21942.0], [561.0, 21574.0], [605.0, 21625.0], [607.0, 21268.0], [603.0, 21157.0], [601.0, 21328.0], [599.0, 21958.0], [595.0, 21846.0], [593.0, 21405.0], [591.0, 21610.0], [579.0, 21596.0], [577.0, 21980.0], [583.0, 21630.0], [581.0, 21906.0], [589.0, 21466.0], [587.0, 21550.0], [585.0, 21562.0], [639.0, 21013.0], [627.0, 11408.0], [635.0, 11354.0], [637.0, 21043.0], [633.0, 21371.0], [615.0, 21749.0], [613.0, 21445.0], [611.0, 21105.0], [609.0, 21591.0], [631.0, 21055.0], [629.0, 21179.0], [625.0, 21547.0], [623.0, 20886.0], [621.0, 21352.0], [619.0, 21081.0], [617.0, 21308.0], [669.0, 21112.0], [649.0, 11383.0], [651.0, 20745.0], [671.0, 20948.0], [667.0, 20989.0], [665.0, 21127.5], [663.0, 21052.0], [661.0, 20875.0], [659.0, 21017.0], [655.0, 20921.0], [643.0, 21483.0], [641.0, 21646.0], [647.0, 20973.0], [645.0, 20689.0], [653.0, 21108.0], [701.0, 20768.0], [703.0, 20518.0], [699.0, 20762.5], [697.0, 20612.0], [695.0, 20687.0], [693.0, 21214.0], [691.0, 20567.0], [689.0, 20810.0], [687.0, 20763.0], [675.0, 21034.0], [673.0, 21209.0], [679.0, 21249.0], [677.0, 21116.0], [685.0, 20985.0], [683.0, 20971.5], [681.0, 20969.0], [733.0, 20655.0], [735.0, 20037.0], [731.0, 20790.0], [729.0, 20789.0], [727.0, 20701.0], [725.0, 20635.0], [723.0, 20514.0], [721.0, 20969.0], [719.0, 20605.0], [707.0, 20762.0], [705.0, 21956.0], [711.0, 20960.0], [709.0, 20694.0], [717.0, 20946.0], [715.0, 20957.0], [713.0, 20881.0], [765.0, 21116.5], [767.0, 19977.0], [763.0, 20467.0], [761.0, 20053.0], [759.0, 19996.0], [757.0, 20324.0], [755.0, 20314.0], [753.0, 18758.0], [751.0, 20279.0], [739.0, 20566.0], [737.0, 20459.0], [743.0, 22513.0], [741.0, 20392.0], [749.0, 20568.0], [747.0, 24022.0], [745.0, 20139.0], [797.0, 19207.0], [799.0, 19942.0], [795.0, 20096.0], [793.0, 21856.0], [791.0, 19925.0], [789.0, 23567.0], [787.0, 19965.0], [785.0, 19817.0], [783.0, 21363.0], [771.0, 20110.0], [769.0, 23631.0], [775.0, 19932.0], [773.0, 20289.0], [781.0, 21755.0], [779.0, 20066.0], [777.0, 20008.0], [827.0, 22648.0], [805.0, 10460.0], [829.0, 19634.0], [825.0, 19331.0], [807.0, 19411.0], [823.0, 22704.0], [821.0, 19333.0], [819.0, 19471.0], [817.0, 19848.0], [815.0, 22957.0], [803.0, 23356.0], [801.0, 19712.0], [813.0, 19626.0], [811.0, 19708.0], [809.0, 19869.0], [861.0, 20314.0], [863.0, 19321.0], [859.0, 19412.0], [857.0, 19159.0], [855.0, 20783.0], [853.0, 19260.0], [851.0, 19963.0], [849.0, 19146.0], [847.0, 20179.0], [835.0, 19513.0], [833.0, 19281.0], [839.0, 19263.0], [837.0, 22920.0], [845.0, 19183.0], [843.0, 19536.0], [841.0, 19904.0], [895.0, 19522.0], [883.0, 10538.0], [893.0, 20794.0], [891.0, 18812.0], [889.0, 19789.0], [871.0, 19101.0], [869.0, 19207.0], [867.0, 21177.0], [865.0, 20904.0], [887.0, 22457.0], [885.0, 19943.0], [881.0, 20899.0], [879.0, 19609.0], [877.0, 20998.0], [875.0, 21768.0], [873.0, 19004.0], [925.0, 19201.0], [913.0, 11493.5], [915.0, 12035.5], [927.0, 20539.0], [923.0, 21782.0], [921.0, 21328.0], [919.0, 22176.0], [917.0, 19578.0], [911.0, 18556.0], [899.0, 19151.0], [897.0, 19028.0], [903.0, 18820.0], [901.0, 18872.0], [909.0, 20759.0], [907.0, 19998.0], [905.0, 20351.0], [959.0, 18542.0], [939.0, 10620.5], [937.0, 20168.5], [941.0, 21618.0], [945.0, 11206.5], [957.0, 19714.0], [955.0, 19558.0], [953.0, 21518.0], [935.0, 20114.0], [933.0, 18659.0], [931.0, 18433.0], [929.0, 22110.0], [943.0, 19707.0], [951.0, 19379.0], [949.0, 18597.0], [947.0, 21372.0], [989.0, 20061.0], [991.0, 18964.0], [987.0, 18759.0], [985.0, 18953.0], [983.0, 18988.0], [981.0, 19099.0], [979.0, 18934.0], [977.0, 19304.0], [975.0, 21429.0], [963.0, 18868.0], [961.0, 19005.0], [967.0, 18858.0], [965.0, 20222.0], [973.0, 21712.0], [971.0, 19303.0], [969.0, 20014.0], [995.0, 11903.5], [1019.0, 20981.0], [993.0, 19944.0], [997.0, 19858.0], [1017.0, 18421.0], [1001.0, 11010.0], [1003.0, 19932.0], [1005.0, 19839.0], [1007.0, 21191.0], [1013.0, 11563.5], [1011.0, 21327.0], [1015.0, 19755.0], [1021.0, 10386.0], [1023.0, 18487.0], [1082.0, 20336.0], [1086.0, 20468.0], [1062.0, 18788.0], [1066.0, 19294.0], [1078.0, 20388.0], [1074.0, 18281.0], [1054.0, 20263.0], [1026.0, 19610.0], [1030.0, 21080.0], [1034.0, 19499.0], [1038.0, 19639.0], [1050.0, 21143.0], [1046.0, 18905.0], [1042.0, 18403.0], [1070.0, 19236.0], [1102.0, 11919.0], [1094.0, 20066.0], [1090.0, 18036.0], [1098.0, 20553.0], [1138.0, 16887.0], [1142.0, 18945.0], [1146.0, 7994.333333333333], [1150.0, 16400.0], [1106.0, 20476.0], [1110.0, 17383.0], [1118.0, 5740.333333333333], [1114.0, 17580.0], [1122.0, 17647.0], [1126.0, 18258.0], [1130.0, 18239.0], [1134.0, 19377.0], [1210.0, 16467.0], [1214.0, 17487.0], [1186.0, 17526.0], [1190.0, 16621.0], [1194.0, 17289.0], [1206.0, 18876.0], [1202.0, 18614.0], [1182.0, 17505.0], [1154.0, 18078.0], [1158.0, 18019.0], [1162.0, 16576.0], [1178.0, 18884.0], [1174.0, 17921.0], [1170.0, 17968.0], [1198.0, 16197.0], [1274.0, 15755.0], [1278.0, 16512.0], [1250.0, 15684.0], [1254.0, 17049.0], [1258.0, 15434.0], [1270.0, 15174.0], [1266.0, 15479.0], [1246.0, 18777.0], [1222.0, 17181.0], [1226.0, 17402.0], [1230.0, 16798.0], [1242.0, 16208.0], [1234.0, 16000.0], [1262.0, 17012.0], [1338.0, 15970.0], [1342.0, 16139.0], [1314.0, 15964.0], [1318.0, 16383.0], [1322.0, 16362.0], [1334.0, 15906.0], [1330.0, 14642.0], [1310.0, 14723.0], [1282.0, 16795.0], [1286.0, 16148.0], [1290.0, 15362.0], [1294.0, 16642.0], [1306.0, 15057.0], [1302.0, 16396.0], [1298.0, 15178.0], [1326.0, 16195.0], [1402.0, 14181.0], [1406.0, 14292.0], [1378.0, 14382.0], [1382.0, 14267.0], [1386.0, 14554.0], [1398.0, 15592.0], [1394.0, 14139.0], [1346.0, 14987.0], [1350.0, 14619.0], [1354.0, 14827.0], [1358.0, 15797.0], [1370.0, 15896.0], [1366.0, 15587.0], [1362.0, 15500.0], [1390.0, 13988.0], [1466.0, 14898.0], [1470.0, 14971.0], [1442.0, 13984.0], [1446.0, 14257.0], [1462.0, 14716.0], [1458.0, 13875.0], [1438.0, 14050.0], [1410.0, 13621.0], [1414.0, 14366.0], [1418.0, 14492.5], [1434.0, 14189.0], [1430.0, 15298.0], [1426.0, 13897.0], [1450.0, 13929.0], [1530.0, 12769.0], [1510.0, 13953.0], [1506.0, 14655.0], [1514.0, 12886.0], [1518.0, 14554.0], [1534.0, 8462.0], [1526.0, 14383.0], [1522.0, 12989.0], [1486.0, 14802.0], [1482.0, 13819.0], [1478.0, 13519.0], [1474.0, 13722.0], [1502.0, 14650.0], [1498.0, 13474.0], [1494.0, 13318.0], [1490.0, 13243.0], [1566.0, 13462.0], [1574.0, 12913.5], [1570.0, 12839.0], [1578.0, 13979.0], [1582.0, 12550.0], [1558.0, 6497.333333333334], [1554.0, 14198.0], [1562.0, 7271.333333333334], [1538.0, 14163.0], [1542.0, 13814.0], [1550.0, 14235.0], [1546.0, 12748.0], [1586.0, 13942.5], [1590.0, 12748.0], [1598.0, 12400.0], [1594.0, 12492.0], [1610.0, 13687.0], [1654.0, 6080.25], [1650.0, 11954.0], [1614.0, 13021.0], [1606.0, 12013.0], [1602.0, 7051.0], [1622.0, 13658.0], [1618.0, 13201.0], [1626.0, 13535.0], [1630.0, 13382.0], [1634.0, 7853.0], [1638.0, 7865.0], [1642.0, 12555.0], [1646.0, 13367.0], [1662.0, 12919.0], [1658.0, 13417.0], [1674.0, 7918.0], [1666.0, 8026.0], [1694.0, 13068.0], [1670.0, 8543.0], [1726.0, 11970.0], [1698.0, 12812.0], [1702.0, 12667.0], [1722.0, 11988.0], [1718.0, 13308.0], [1714.0, 12218.0], [1678.0, 13168.0], [1686.0, 12243.0], [1682.0, 12979.0], [1706.0, 8438.5], [1710.0, 11438.5], [1734.0, 7768.5], [1786.0, 11594.0], [1758.0, 11798.0], [1730.0, 10821.0], [1738.0, 11099.0], [1742.0, 11063.0], [1782.0, 11593.0], [1778.0, 11707.0], [1746.0, 10679.0], [1750.0, 10761.0], [1754.0, 11168.0], [1766.0, 11038.0], [1762.0, 10615.0], [1770.0, 10689.0], [1774.0, 10400.5], [1790.0, 10564.0], [1794.0, 10698.0], [1846.0, 8011.5], [1822.0, 12263.0], [1798.0, 10276.0], [1802.0, 11405.0], [1818.0, 10230.0], [1814.0, 11039.5], [1810.0, 10564.0], [1854.0, 10666.0], [1826.0, 10944.0], [1830.0, 10948.0], [1834.0, 10942.0], [1838.0, 10909.0], [1850.0, 11527.0], [1842.0, 10261.0], [1806.0, 11347.0], [1866.0, 10519.0], [1858.0, 6255.25], [1886.0, 10302.0], [1882.0, 10353.0], [1862.0, 7419.0], [1870.0, 9334.0], [1894.0, 11768.0], [1898.0, 10243.0], [1902.0, 7198.5], [1890.0, 9385.5], [1914.0, 10083.0], [1918.0, 10722.0], [1906.0, 6989.5], [1910.0, 11131.0], [1874.0, 8853.0], [1878.0, 9512.0], [1930.0, 9919.0], [1922.0, 10660.0], [1950.0, 9770.0], [1926.0, 10648.0], [1934.0, 7208.5], [1974.0, 7300.0], [1982.0, 10378.0], [1978.0, 10563.0], [1970.0, 5613.25], [1954.0, 11198.0], [1958.0, 8756.0], [1962.0, 8820.0], [1966.0, 9570.0], [1946.0, 7916.0], [1942.0, 10938.0], [1938.0, 9183.0], [1994.0, 10246.0], [1986.0, 7803.5], [2014.0, 6038.5], [1990.0, 5734.0], [1998.0, 10614.0], [2018.0, 10381.0], [2046.0, 6242.666666666667], [2042.0, 7106.5], [2038.0, 9032.0], [2034.0, 5785.0], [2022.0, 9987.0], [2030.0, 10015.0], [2026.0, 6857.5], [2002.0, 6098.666666666667], [2006.0, 7196.5], [2052.0, 9983.0], [2108.0, 6469.5], [2060.0, 6905.0], [2100.0, 10190.0], [2092.0, 5822.333333333333], [2084.0, 7184.0], [2068.0, 7143.0], [2076.0, 9604.0], [2116.0, 9892.0], [2172.0, 7090.5], [2164.0, 9818.0], [2148.0, 9227.0], [2156.0, 8187.0], [2132.0, 7406.0], [2124.0, 9840.0], [2140.0, 10153.0], [2188.0, 7238.0], [2196.0, 6145.0], [2228.0, 7168.0], [2220.0, 8807.0], [2212.0, 6852.0], [2236.0, 8374.0], [2204.0, 6784.0], [2276.0, 8191.0], [2284.0, 6685.0], [2292.0, 8550.0], [2300.0, 8060.0], [2244.0, 6019.75], [2252.0, 6619.0], [2260.0, 8691.0], [2268.0, 9124.0], [2404.0, 6346.5], [2308.0, 8577.0], [2316.0, 8700.0], [2324.0, 8112.0], [2364.0, 6242.5], [2356.0, 6364.0], [2412.0, 6210.5], [2428.0, 6407.0], [2332.0, 6901.0], [2396.0, 7355.0], [2388.0, 7875.0], [2380.0, 7580.0], [2372.0, 7014.0], [2340.0, 6868.5], [2348.0, 7894.0], [2492.0, 6411.0], [2436.0, 6085.5], [2484.0, 6288.0], [2476.0, 6134.0], [2468.0, 6114.5], [2444.0, 6409.0], [2452.0, 6151.0], [2460.0, 6456.0], [2500.0, 5645.0], [2053.0, 6374.5], [2061.0, 9740.0], [2109.0, 5222.0], [2101.0, 7352.0], [2093.0, 9687.0], [2085.0, 7309.0], [2069.0, 6493.333333333333], [2173.0, 8872.0], [2165.0, 8122.0], [2157.0, 6636.5], [2077.0, 9644.0], [2149.0, 9029.0], [2117.0, 6552.333333333333], [2125.0, 7429.0], [2133.0, 9616.0], [2141.0, 9205.0], [2197.0, 7135.0], [2181.0, 7172.25], [2229.0, 6825.0], [2237.0, 8838.0], [2221.0, 6675.5], [2213.0, 8850.0], [2205.0, 6367.0], [2277.0, 8610.0], [2301.0, 6881.5], [2293.0, 8466.0], [2285.0, 8543.0], [2269.0, 8315.0], [2261.0, 7156.0], [2253.0, 8904.0], [2245.0, 8497.0], [2189.0, 9665.0], [2325.0, 7817.0], [2357.0, 7441.0], [2309.0, 7272.0], [2365.0, 6114.5], [2317.0, 8079.0], [2333.0, 7859.0], [2405.0, 7016.0], [2413.0, 6953.0], [2421.0, 6682.5], [2373.0, 7577.0], [2381.0, 7370.0], [2389.0, 7205.0], [2397.0, 7096.0], [2429.0, 6874.0], [2341.0, 7381.0], [2349.0, 7129.0], [2437.0, 6457.0], [2485.0, 5841.0], [2493.0, 5802.0], [2477.0, 6040.5], [2469.0, 5985.0], [2445.0, 6379.0], [2453.0, 6414.0], [2461.0, 6431.0], [2501.0, 6064.0], [1027.0, 17928.0], [1031.0, 20734.0], [1055.0, 20312.0], [1051.0, 18016.0], [1047.0, 19285.0], [1043.0, 20707.0], [1087.0, 19230.0], [1059.0, 18984.5], [1063.0, 17760.0], [1067.0, 19324.0], [1071.0, 18286.0], [1083.0, 20734.0], [1079.0, 20323.0], [1075.0, 19201.0], [1039.0, 19630.0], [1035.0, 19691.0], [1119.0, 18389.0], [1147.0, 10484.0], [1111.0, 8810.0], [1107.0, 20522.0], [1115.0, 18745.0], [1091.0, 19248.0], [1095.0, 17679.0], [1099.0, 20452.0], [1103.0, 17856.0], [1123.0, 18320.0], [1127.0, 17180.0], [1131.0, 16803.0], [1135.0, 17136.0], [1151.0, 16504.0], [1143.0, 19398.0], [1139.0, 18175.0], [1159.0, 16837.0], [1155.0, 17091.0], [1163.0, 17068.0], [1167.0, 16994.0], [1183.0, 17502.0], [1179.0, 18800.0], [1175.0, 16165.0], [1171.0, 17830.0], [1215.0, 17154.0], [1187.0, 17293.0], [1191.0, 16790.0], [1195.0, 16489.0], [1199.0, 16196.0], [1211.0, 17582.0], [1207.0, 16233.0], [1203.0, 17469.0], [1275.0, 16091.0], [1279.0, 15795.0], [1251.0, 16561.0], [1255.0, 16760.0], [1259.0, 16172.0], [1271.0, 16659.0], [1267.0, 16515.0], [1247.0, 16956.0], [1219.0, 16371.5], [1223.0, 17254.0], [1227.0, 16827.0], [1231.0, 16698.0], [1243.0, 15569.0], [1239.0, 16459.5], [1235.0, 16901.0], [1263.0, 15864.0], [1339.0, 15270.0], [1343.0, 16081.0], [1315.0, 16401.0], [1319.0, 14819.0], [1323.0, 15851.0], [1335.0, 16163.0], [1331.0, 16185.0], [1311.0, 14954.0], [1283.0, 16664.0], [1287.0, 15554.0], [1291.0, 16317.0], [1295.0, 14994.0], [1307.0, 16050.0], [1303.0, 14877.0], [1299.0, 15035.0], [1327.0, 15802.0], [1403.0, 15515.0], [1407.0, 13775.0], [1379.0, 14393.0], [1383.0, 14230.0], [1387.0, 15548.0], [1399.0, 15279.0], [1395.0, 15163.0], [1375.0, 14933.0], [1347.0, 16061.0], [1351.0, 14472.0], [1355.0, 14889.0], [1359.0, 15977.0], [1371.0, 15702.0], [1367.0, 15098.0], [1363.0, 15081.0], [1391.0, 14802.0], [1467.0, 14717.0], [1471.0, 14544.0], [1443.0, 13609.0], [1447.0, 15208.0], [1451.0, 14765.0], [1463.0, 14666.0], [1459.0, 14857.0], [1439.0, 14012.0], [1411.0, 15364.0], [1419.0, 15377.0], [1415.0, 15073.0], [1423.0, 14145.0], [1435.0, 15125.0], [1431.0, 13975.0], [1427.0, 14206.0], [1455.0, 13862.0], [1531.0, 12752.0], [1535.0, 8378.0], [1511.0, 14665.0], [1515.0, 13349.0], [1527.0, 14410.0], [1523.0, 12724.0], [1503.0, 13989.0], [1475.0, 13434.0], [1479.0, 13837.0], [1483.0, 13549.0], [1487.0, 13484.0], [1499.0, 13194.0], [1495.0, 13417.0], [1491.0, 14781.0], [1519.0, 13133.0], [1547.0, 13845.0], [1543.0, 3760.0], [1539.0, 8542.0], [1567.0, 13841.0], [1563.0, 12888.0], [1587.0, 13539.0], [1551.0, 14231.0], [1591.0, 13580.0], [1595.0, 13319.0], [1599.0, 13632.0], [1571.0, 8527.0], [1575.0, 7064.666666666666], [1579.0, 13543.0], [1583.0, 13024.0], [1555.0, 8261.5], [1559.0, 13371.0], [1631.0, 13303.0], [1619.0, 13665.0], [1623.0, 12555.0], [1627.0, 12602.0], [1639.0, 13031.0], [1643.0, 12360.0], [1647.0, 13426.0], [1651.0, 12280.0], [1615.0, 12467.0], [1611.0, 12177.0], [1607.0, 12513.0], [1603.0, 12701.0], [1655.0, 11698.0], [1663.0, 11756.0], [1635.0, 12543.0], [1659.0, 13273.0], [1695.0, 8446.0], [1715.0, 8111.5], [1687.0, 8607.0], [1683.0, 11855.0], [1691.0, 11369.0], [1679.0, 12678.0], [1675.0, 11817.0], [1671.0, 11637.0], [1667.0, 12830.0], [1707.0, 7009.0], [1711.0, 11225.0], [1727.0, 10687.0], [1699.0, 11801.0], [1703.0, 12512.0], [1723.0, 10827.0], [1719.0, 11584.0], [1735.0, 11027.0], [1739.0, 8117.5], [1731.0, 11409.0], [1743.0, 10702.0], [1779.0, 10897.0], [1783.0, 11497.0], [1747.0, 10832.0], [1751.0, 11070.0], [1755.0, 12618.0], [1759.0, 10302.0], [1775.0, 10684.0], [1771.0, 11674.0], [1791.0, 11455.0], [1763.0, 10594.0], [1767.0, 10371.0], [1787.0, 10541.0], [1847.0, 10182.0], [1815.0, 10416.0], [1811.0, 10103.0], [1819.0, 11091.0], [1827.0, 10870.0], [1831.0, 10425.0], [1835.0, 10516.0], [1839.0, 10788.0], [1851.0, 7459.0], [1855.0, 10659.0], [1843.0, 10046.0], [1823.0, 11001.0], [1795.0, 11394.0], [1799.0, 10734.0], [1803.0, 10420.0], [1807.0, 12926.0], [1863.0, 9716.0], [1871.0, 8041.0], [1887.0, 10280.0], [1883.0, 11461.0], [1859.0, 7953.0], [1867.0, 9924.0], [1895.0, 11006.0], [1899.0, 5895.333333333333], [1903.0, 10150.0], [1891.0, 7294.5], [1915.0, 7039.5], [1919.0, 6402.666666666667], [1907.0, 10954.0], [1911.0, 5759.2], [1875.0, 7049.0], [1879.0, 7274.0], [1931.0, 7721.0], [1971.0, 6306.666666666667], [1923.0, 10784.0], [1951.0, 11089.0], [1927.0, 9941.0], [1935.0, 10788.0], [1983.0, 6789.5], [1979.0, 10577.0], [1975.0, 10368.0], [1955.0, 7541.0], [1959.0, 4821.5], [1963.0, 11266.0], [1967.0, 7265.0], [1947.0, 6393.0], [1943.0, 11621.0], [1939.0, 9850.0], [1995.0, 9328.0], [1999.0, 7442.5], [2015.0, 9170.0], [2011.0, 8183.666666666667], [1987.0, 10104.0], [1991.0, 8358.0], [2019.0, 8471.0], [2047.0, 10200.0], [2039.0, 8992.0], [2043.0, 8067.0], [2035.0, 6554.0], [2023.0, 10657.0], [2027.0, 7832.0], [2031.0, 10007.0], [2003.0, 9319.0], [2007.0, 8291.0], [2054.0, 7851.0], [2094.0, 9333.0], [2086.0, 10331.0], [2110.0, 9646.0], [2062.0, 8820.0], [2070.0, 9912.0], [2078.0, 4870.5], [2118.0, 9547.0], [2174.0, 9475.0], [2158.0, 6502.333333333333], [2166.0, 7108.0], [2150.0, 9888.0], [2134.0, 7385.0], [2142.0, 8335.0], [2238.0, 8676.0], [2182.0, 6815.0], [2222.0, 6045.333333333333], [2214.0, 7595.0], [2230.0, 9347.0], [2190.0, 7916.0], [2198.0, 8581.0], [2206.0, 6362.666666666667], [2278.0, 8370.0], [2294.0, 8619.0], [2286.0, 8783.0], [2302.0, 7995.0], [2246.0, 9049.0], [2254.0, 8552.0], [2262.0, 8702.0], [2270.0, 8120.0], [2406.0, 6507.5], [2366.0, 6458.0], [2310.0, 8423.0], [2358.0, 6683.5], [2326.0, 6723.0], [2422.0, 6410.5], [2414.0, 7107.0], [2430.0, 5941.333333333333], [2334.0, 7985.0], [2398.0, 6034.0], [2390.0, 7246.0], [2382.0, 7368.0], [2350.0, 7944.0], [2342.0, 7881.0], [2494.0, 6135.0], [2438.0, 6443.0], [2478.0, 5964.0], [2486.0, 5859.0], [2470.0, 6005.0], [2446.0, 6340.0], [2454.0, 6232.0], [2462.0, 5952.333333333333], [2055.0, 10462.0], [2111.0, 5714.6], [2103.0, 8131.333333333333], [2087.0, 9697.0], [2095.0, 7863.0], [2063.0, 10275.0], [2175.0, 7008.0], [2159.0, 8118.0], [2167.0, 7245.5], [2079.0, 10425.5], [2071.0, 8790.0], [2151.0, 9413.0], [2119.0, 7445.5], [2127.0, 8483.333333333334], [2135.0, 9666.0], [2143.0, 9157.0], [2199.0, 8455.0], [2183.0, 9923.0], [2239.0, 6399.0], [2231.0, 8306.0], [2223.0, 5802.2], [2215.0, 6390.0], [2279.0, 6540.333333333333], [2207.0, 8757.0], [2303.0, 7097.5], [2295.0, 6498.333333333333], [2287.0, 8913.0], [2271.0, 6154.333333333333], [2263.0, 7912.0], [2255.0, 6846.5], [2247.0, 8283.0], [2191.0, 6192.5], [2327.0, 7416.0], [2415.0, 6372.5], [2311.0, 7937.0], [2367.0, 7141.0], [2359.0, 6634.0], [2319.0, 8574.5], [2335.0, 7461.0], [2407.0, 6962.0], [2423.0, 6950.0], [2431.0, 6100.5], [2375.0, 6884.0], [2383.0, 7238.0], [2391.0, 7394.0], [2399.0, 7114.0], [2343.0, 8025.0], [2351.0, 7841.0], [2487.0, 6241.5], [2495.0, 5692.0], [2479.0, 5996.0], [2471.0, 6456.5], [2439.0, 6073.5], [2447.0, 6355.0], [2455.0, 6358.0], [2463.0, 5990.0], [1.0, 24198.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1343.1926666666661, 14250.778333333323]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2501.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 18850.0, "minX": 1.54958346E12, "maxY": 20997.833333333332, "series": [{"data": [[1.54958346E12, 20997.833333333332]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958346E12, 18850.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 14250.778333333323, "minX": 1.54958346E12, "maxY": 14250.778333333323, "series": [{"data": [[1.54958346E12, 14250.778333333323]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 14250.775666666672, "minX": 1.54958346E12, "maxY": 14250.775666666672, "series": [{"data": [[1.54958346E12, 14250.775666666672]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 151.92600000000002, "minX": 1.54958346E12, "maxY": 151.92600000000002, "series": [{"data": [[1.54958346E12, 151.92600000000002]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 534.0, "minX": 1.54958346E12, "maxY": 25180.0, "series": [{"data": [[1.54958346E12, 25180.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958346E12, 534.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958346E12, 23747.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958346E12, 24766.759999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958346E12, 24233.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 13929.0, "minX": 50.0, "maxY": 13929.0, "series": [{"data": [[50.0, 13929.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 13929.0, "minX": 50.0, "maxY": 13929.0, "series": [{"data": [[50.0, 13929.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 50.0, "minX": 1.54958346E12, "maxY": 50.0, "series": [{"data": [[1.54958346E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 50.0, "minX": 1.54958346E12, "maxY": 50.0, "series": [{"data": [[1.54958346E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 50.0, "minX": 1.54958346E12, "maxY": 50.0, "series": [{"data": [[1.54958346E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}

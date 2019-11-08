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
        data: {"result": {"minY": 445.0, "minX": 0.0, "maxY": 22026.0, "series": [{"data": [[0.0, 445.0], [0.1, 556.0], [0.2, 634.0], [0.3, 651.0], [0.4, 683.0], [0.5, 691.0], [0.6, 752.0], [0.7, 770.0], [0.8, 781.0], [0.9, 838.0], [1.0, 848.0], [1.1, 869.0], [1.2, 891.0], [1.3, 907.0], [1.4, 996.0], [1.5, 1090.0], [1.6, 1121.0], [1.7, 1220.0], [1.8, 1276.0], [1.9, 1298.0], [2.0, 1358.0], [2.1, 1431.0], [2.2, 1510.0], [2.3, 1614.0], [2.4, 1680.0], [2.5, 1737.0], [2.6, 1878.0], [2.7, 1989.0], [2.8, 2052.0], [2.9, 2129.0], [3.0, 2180.0], [3.1, 2254.0], [3.2, 2353.0], [3.3, 2421.0], [3.4, 2509.0], [3.5, 2546.0], [3.6, 2630.0], [3.7, 2743.0], [3.8, 2779.0], [3.9, 2833.0], [4.0, 2890.0], [4.1, 2900.0], [4.2, 2944.0], [4.3, 2956.0], [4.4, 2976.0], [4.5, 2992.0], [4.6, 3009.0], [4.7, 3026.0], [4.8, 3039.0], [4.9, 3068.0], [5.0, 3080.0], [5.1, 3091.0], [5.2, 3122.0], [5.3, 3132.0], [5.4, 3140.0], [5.5, 3159.0], [5.6, 3176.0], [5.7, 3192.0], [5.8, 3229.0], [5.9, 3258.0], [6.0, 3286.0], [6.1, 3289.0], [6.2, 3328.0], [6.3, 3349.0], [6.4, 3366.0], [6.5, 3375.0], [6.6, 3405.0], [6.7, 3414.0], [6.8, 3467.0], [6.9, 3496.0], [7.0, 3520.0], [7.1, 3554.0], [7.2, 3564.0], [7.3, 3589.0], [7.4, 3624.0], [7.5, 3646.0], [7.6, 3667.0], [7.7, 3695.0], [7.8, 3714.0], [7.9, 3744.0], [8.0, 3761.0], [8.1, 3785.0], [8.2, 3798.0], [8.3, 3820.0], [8.4, 3835.0], [8.5, 3861.0], [8.6, 3881.0], [8.7, 3901.0], [8.8, 3954.0], [8.9, 3974.0], [9.0, 4006.0], [9.1, 4036.0], [9.2, 4057.0], [9.3, 4071.0], [9.4, 4099.0], [9.5, 4118.0], [9.6, 4166.0], [9.7, 4190.0], [9.8, 4215.0], [9.9, 4234.0], [10.0, 4242.0], [10.1, 4249.0], [10.2, 4256.0], [10.3, 4298.0], [10.4, 4305.0], [10.5, 4328.0], [10.6, 4360.0], [10.7, 4371.0], [10.8, 4390.0], [10.9, 4393.0], [11.0, 4408.0], [11.1, 4420.0], [11.2, 4434.0], [11.3, 4446.0], [11.4, 4463.0], [11.5, 4486.0], [11.6, 4498.0], [11.7, 4506.0], [11.8, 4523.0], [11.9, 4567.0], [12.0, 4584.0], [12.1, 4612.0], [12.2, 4622.0], [12.3, 4654.0], [12.4, 4677.0], [12.5, 4686.0], [12.6, 4718.0], [12.7, 4721.0], [12.8, 4736.0], [12.9, 4760.0], [13.0, 4765.0], [13.1, 4781.0], [13.2, 4789.0], [13.3, 4815.0], [13.4, 4836.0], [13.5, 4846.0], [13.6, 4867.0], [13.7, 4880.0], [13.8, 4882.0], [13.9, 4891.0], [14.0, 4909.0], [14.1, 4926.0], [14.2, 4954.0], [14.3, 4962.0], [14.4, 4982.0], [14.5, 4997.0], [14.6, 5003.0], [14.7, 5005.0], [14.8, 5021.0], [14.9, 5032.0], [15.0, 5045.0], [15.1, 5050.0], [15.2, 5056.0], [15.3, 5088.0], [15.4, 5097.0], [15.5, 5127.0], [15.6, 5134.0], [15.7, 5148.0], [15.8, 5179.0], [15.9, 5196.0], [16.0, 5214.0], [16.1, 5247.0], [16.2, 5276.0], [16.3, 5304.0], [16.4, 5336.0], [16.5, 5391.0], [16.6, 5419.0], [16.7, 5460.0], [16.8, 5486.0], [16.9, 5498.0], [17.0, 5508.0], [17.1, 5516.0], [17.2, 5533.0], [17.3, 5546.0], [17.4, 5564.0], [17.5, 5611.0], [17.6, 5642.0], [17.7, 5673.0], [17.8, 5677.0], [17.9, 5694.0], [18.0, 5740.0], [18.1, 5762.0], [18.2, 5784.0], [18.3, 5809.0], [18.4, 5815.0], [18.5, 5841.0], [18.6, 5859.0], [18.7, 5900.0], [18.8, 5941.0], [18.9, 5968.0], [19.0, 5978.0], [19.1, 6001.0], [19.2, 6004.0], [19.3, 6015.0], [19.4, 6059.0], [19.5, 6067.0], [19.6, 6073.0], [19.7, 6087.0], [19.8, 6116.0], [19.9, 6151.0], [20.0, 6175.0], [20.1, 6187.0], [20.2, 6214.0], [20.3, 6226.0], [20.4, 6251.0], [20.5, 6276.0], [20.6, 6297.0], [20.7, 6301.0], [20.8, 6329.0], [20.9, 6346.0], [21.0, 6361.0], [21.1, 6373.0], [21.2, 6391.0], [21.3, 6401.0], [21.4, 6416.0], [21.5, 6428.0], [21.6, 6441.0], [21.7, 6458.0], [21.8, 6468.0], [21.9, 6494.0], [22.0, 6504.0], [22.1, 6522.0], [22.2, 6530.0], [22.3, 6540.0], [22.4, 6549.0], [22.5, 6556.0], [22.6, 6580.0], [22.7, 6592.0], [22.8, 6605.0], [22.9, 6615.0], [23.0, 6619.0], [23.1, 6630.0], [23.2, 6645.0], [23.3, 6680.0], [23.4, 6702.0], [23.5, 6707.0], [23.6, 6720.0], [23.7, 6756.0], [23.8, 6772.0], [23.9, 6785.0], [24.0, 6793.0], [24.1, 6807.0], [24.2, 6890.0], [24.3, 6916.0], [24.4, 6933.0], [24.5, 6936.0], [24.6, 6951.0], [24.7, 6967.0], [24.8, 6973.0], [24.9, 7017.0], [25.0, 7033.0], [25.1, 7047.0], [25.2, 7091.0], [25.3, 7100.0], [25.4, 7117.0], [25.5, 7147.0], [25.6, 7171.0], [25.7, 7217.0], [25.8, 7231.0], [25.9, 7254.0], [26.0, 7263.0], [26.1, 7272.0], [26.2, 7290.0], [26.3, 7304.0], [26.4, 7327.0], [26.5, 7350.0], [26.6, 7361.0], [26.7, 7366.0], [26.8, 7408.0], [26.9, 7411.0], [27.0, 7424.0], [27.1, 7438.0], [27.2, 7467.0], [27.3, 7495.0], [27.4, 7526.0], [27.5, 7551.0], [27.6, 7580.0], [27.7, 7596.0], [27.8, 7599.0], [27.9, 7614.0], [28.0, 7637.0], [28.1, 7696.0], [28.2, 7735.0], [28.3, 7767.0], [28.4, 7782.0], [28.5, 7792.0], [28.6, 7833.0], [28.7, 7836.0], [28.8, 7870.0], [28.9, 7881.0], [29.0, 7917.0], [29.1, 7925.0], [29.2, 7945.0], [29.3, 7966.0], [29.4, 7979.0], [29.5, 8016.0], [29.6, 8023.0], [29.7, 8075.0], [29.8, 8095.0], [29.9, 8175.0], [30.0, 8256.0], [30.1, 8331.0], [30.2, 8397.0], [30.3, 8451.0], [30.4, 8521.0], [30.5, 8536.0], [30.6, 8564.0], [30.7, 8637.0], [30.8, 8664.0], [30.9, 8687.0], [31.0, 8742.0], [31.1, 8762.0], [31.2, 8782.0], [31.3, 8809.0], [31.4, 8843.0], [31.5, 8856.0], [31.6, 8868.0], [31.7, 8875.0], [31.8, 8883.0], [31.9, 8892.0], [32.0, 8924.0], [32.1, 9013.0], [32.2, 9015.0], [32.3, 9030.0], [32.4, 9046.0], [32.5, 9059.0], [32.6, 9083.0], [32.7, 9093.0], [32.8, 9106.0], [32.9, 9128.0], [33.0, 9154.0], [33.1, 9205.0], [33.2, 9270.0], [33.3, 9306.0], [33.4, 9315.0], [33.5, 9322.0], [33.6, 9337.0], [33.7, 9344.0], [33.8, 9378.0], [33.9, 9402.0], [34.0, 9432.0], [34.1, 9449.0], [34.2, 9474.0], [34.3, 9486.0], [34.4, 9493.0], [34.5, 9507.0], [34.6, 9519.0], [34.7, 9526.0], [34.8, 9532.0], [34.9, 9563.0], [35.0, 9594.0], [35.1, 9602.0], [35.2, 9616.0], [35.3, 9624.0], [35.4, 9647.0], [35.5, 9658.0], [35.6, 9671.0], [35.7, 9684.0], [35.8, 9690.0], [35.9, 9695.0], [36.0, 9706.0], [36.1, 9715.0], [36.2, 9726.0], [36.3, 9742.0], [36.4, 9758.0], [36.5, 9775.0], [36.6, 9796.0], [36.7, 9804.0], [36.8, 9826.0], [36.9, 9842.0], [37.0, 9853.0], [37.1, 9857.0], [37.2, 9882.0], [37.3, 9890.0], [37.4, 9910.0], [37.5, 9923.0], [37.6, 9932.0], [37.7, 9951.0], [37.8, 9961.0], [37.9, 9974.0], [38.0, 9978.0], [38.1, 10008.0], [38.2, 10021.0], [38.3, 10039.0], [38.4, 10054.0], [38.5, 10060.0], [38.6, 10093.0], [38.7, 10099.0], [38.8, 10129.0], [38.9, 10140.0], [39.0, 10156.0], [39.1, 10175.0], [39.2, 10189.0], [39.3, 10222.0], [39.4, 10244.0], [39.5, 10265.0], [39.6, 10278.0], [39.7, 10287.0], [39.8, 10294.0], [39.9, 10303.0], [40.0, 10324.0], [40.1, 10333.0], [40.2, 10337.0], [40.3, 10355.0], [40.4, 10377.0], [40.5, 10390.0], [40.6, 10400.0], [40.7, 10420.0], [40.8, 10446.0], [40.9, 10458.0], [41.0, 10469.0], [41.1, 10497.0], [41.2, 10509.0], [41.3, 10534.0], [41.4, 10548.0], [41.5, 10554.0], [41.6, 10581.0], [41.7, 10602.0], [41.8, 10631.0], [41.9, 10648.0], [42.0, 10662.0], [42.1, 10678.0], [42.2, 10685.0], [42.3, 10695.0], [42.4, 10714.0], [42.5, 10743.0], [42.6, 10772.0], [42.7, 10784.0], [42.8, 10795.0], [42.9, 10810.0], [43.0, 10817.0], [43.1, 10843.0], [43.2, 10858.0], [43.3, 10871.0], [43.4, 10888.0], [43.5, 10899.0], [43.6, 10941.0], [43.7, 10980.0], [43.8, 11031.0], [43.9, 11039.0], [44.0, 11059.0], [44.1, 11066.0], [44.2, 11084.0], [44.3, 11099.0], [44.4, 11103.0], [44.5, 11109.0], [44.6, 11122.0], [44.7, 11166.0], [44.8, 11180.0], [44.9, 11188.0], [45.0, 11205.0], [45.1, 11227.0], [45.2, 11237.0], [45.3, 11252.0], [45.4, 11270.0], [45.5, 11290.0], [45.6, 11307.0], [45.7, 11324.0], [45.8, 11333.0], [45.9, 11339.0], [46.0, 11364.0], [46.1, 11371.0], [46.2, 11382.0], [46.3, 11407.0], [46.4, 11439.0], [46.5, 11446.0], [46.6, 11468.0], [46.7, 11485.0], [46.8, 11498.0], [46.9, 11522.0], [47.0, 11533.0], [47.1, 11549.0], [47.2, 11565.0], [47.3, 11594.0], [47.4, 11615.0], [47.5, 11635.0], [47.6, 11649.0], [47.7, 11659.0], [47.8, 11670.0], [47.9, 11685.0], [48.0, 11695.0], [48.1, 11708.0], [48.2, 11739.0], [48.3, 11747.0], [48.4, 11795.0], [48.5, 11826.0], [48.6, 11844.0], [48.7, 11867.0], [48.8, 11915.0], [48.9, 11947.0], [49.0, 11971.0], [49.1, 11989.0], [49.2, 12016.0], [49.3, 12044.0], [49.4, 12066.0], [49.5, 12108.0], [49.6, 12155.0], [49.7, 12178.0], [49.8, 12226.0], [49.9, 12244.0], [50.0, 12252.0], [50.1, 12273.0], [50.2, 12289.0], [50.3, 12298.0], [50.4, 12324.0], [50.5, 12354.0], [50.6, 12381.0], [50.7, 12410.0], [50.8, 12435.0], [50.9, 12444.0], [51.0, 12458.0], [51.1, 12483.0], [51.2, 12492.0], [51.3, 12534.0], [51.4, 12541.0], [51.5, 12565.0], [51.6, 12587.0], [51.7, 12598.0], [51.8, 12609.0], [51.9, 12618.0], [52.0, 12637.0], [52.1, 12645.0], [52.2, 12647.0], [52.3, 12651.0], [52.4, 12663.0], [52.5, 12666.0], [52.6, 12673.0], [52.7, 12682.0], [52.8, 12692.0], [52.9, 12701.0], [53.0, 12742.0], [53.1, 12764.0], [53.2, 12774.0], [53.3, 12793.0], [53.4, 12807.0], [53.5, 12850.0], [53.6, 12860.0], [53.7, 12874.0], [53.8, 12905.0], [53.9, 12931.0], [54.0, 12986.0], [54.1, 12997.0], [54.2, 13017.0], [54.3, 13031.0], [54.4, 13076.0], [54.5, 13130.0], [54.6, 13183.0], [54.7, 13260.0], [54.8, 13292.0], [54.9, 13298.0], [55.0, 13323.0], [55.1, 13340.0], [55.2, 13360.0], [55.3, 13390.0], [55.4, 13415.0], [55.5, 13427.0], [55.6, 13438.0], [55.7, 13452.0], [55.8, 13476.0], [55.9, 13488.0], [56.0, 13527.0], [56.1, 13545.0], [56.2, 13568.0], [56.3, 13603.0], [56.4, 13622.0], [56.5, 13646.0], [56.6, 13666.0], [56.7, 13698.0], [56.8, 13708.0], [56.9, 13723.0], [57.0, 13738.0], [57.1, 13749.0], [57.2, 13754.0], [57.3, 13781.0], [57.4, 13791.0], [57.5, 13804.0], [57.6, 13836.0], [57.7, 13850.0], [57.8, 13867.0], [57.9, 13917.0], [58.0, 13939.0], [58.1, 13958.0], [58.2, 13989.0], [58.3, 14007.0], [58.4, 14035.0], [58.5, 14058.0], [58.6, 14084.0], [58.7, 14095.0], [58.8, 14142.0], [58.9, 14157.0], [59.0, 14197.0], [59.1, 14219.0], [59.2, 14238.0], [59.3, 14265.0], [59.4, 14285.0], [59.5, 14308.0], [59.6, 14323.0], [59.7, 14349.0], [59.8, 14366.0], [59.9, 14376.0], [60.0, 14402.0], [60.1, 14409.0], [60.2, 14432.0], [60.3, 14479.0], [60.4, 14486.0], [60.5, 14514.0], [60.6, 14530.0], [60.7, 14544.0], [60.8, 14565.0], [60.9, 14601.0], [61.0, 14610.0], [61.1, 14637.0], [61.2, 14657.0], [61.3, 14680.0], [61.4, 14704.0], [61.5, 14735.0], [61.6, 14764.0], [61.7, 14793.0], [61.8, 14821.0], [61.9, 14860.0], [62.0, 14878.0], [62.1, 14890.0], [62.2, 14905.0], [62.3, 14926.0], [62.4, 14935.0], [62.5, 14941.0], [62.6, 14953.0], [62.7, 14969.0], [62.8, 14995.0], [62.9, 15011.0], [63.0, 15025.0], [63.1, 15049.0], [63.2, 15084.0], [63.3, 15108.0], [63.4, 15113.0], [63.5, 15132.0], [63.6, 15156.0], [63.7, 15176.0], [63.8, 15180.0], [63.9, 15187.0], [64.0, 15208.0], [64.1, 15233.0], [64.2, 15237.0], [64.3, 15244.0], [64.4, 15268.0], [64.5, 15284.0], [64.6, 15312.0], [64.7, 15339.0], [64.8, 15364.0], [64.9, 15395.0], [65.0, 15420.0], [65.1, 15461.0], [65.2, 15506.0], [65.3, 15511.0], [65.4, 15521.0], [65.5, 15558.0], [65.6, 15574.0], [65.7, 15593.0], [65.8, 15606.0], [65.9, 15637.0], [66.0, 15644.0], [66.1, 15660.0], [66.2, 15668.0], [66.3, 15694.0], [66.4, 15719.0], [66.5, 15749.0], [66.6, 15775.0], [66.7, 15802.0], [66.8, 15868.0], [66.9, 15900.0], [67.0, 15918.0], [67.1, 15934.0], [67.2, 15950.0], [67.3, 15961.0], [67.4, 16012.0], [67.5, 16023.0], [67.6, 16037.0], [67.7, 16056.0], [67.8, 16080.0], [67.9, 16103.0], [68.0, 16137.0], [68.1, 16149.0], [68.2, 16179.0], [68.3, 16193.0], [68.4, 16206.0], [68.5, 16238.0], [68.6, 16249.0], [68.7, 16273.0], [68.8, 16299.0], [68.9, 16323.0], [69.0, 16348.0], [69.1, 16359.0], [69.2, 16374.0], [69.3, 16388.0], [69.4, 16411.0], [69.5, 16435.0], [69.6, 16455.0], [69.7, 16457.0], [69.8, 16500.0], [69.9, 16515.0], [70.0, 16539.0], [70.1, 16555.0], [70.2, 16579.0], [70.3, 16607.0], [70.4, 16621.0], [70.5, 16625.0], [70.6, 16643.0], [70.7, 16687.0], [70.8, 16692.0], [70.9, 16702.0], [71.0, 16708.0], [71.1, 16743.0], [71.2, 16764.0], [71.3, 16781.0], [71.4, 16798.0], [71.5, 16810.0], [71.6, 16818.0], [71.7, 16829.0], [71.8, 16839.0], [71.9, 16849.0], [72.0, 16870.0], [72.1, 16878.0], [72.2, 16898.0], [72.3, 16904.0], [72.4, 16942.0], [72.5, 16946.0], [72.6, 16991.0], [72.7, 17010.0], [72.8, 17033.0], [72.9, 17067.0], [73.0, 17083.0], [73.1, 17118.0], [73.2, 17128.0], [73.3, 17159.0], [73.4, 17171.0], [73.5, 17197.0], [73.6, 17213.0], [73.7, 17281.0], [73.8, 17315.0], [73.9, 17343.0], [74.0, 17368.0], [74.1, 17381.0], [74.2, 17417.0], [74.3, 17435.0], [74.4, 17456.0], [74.5, 17482.0], [74.6, 17487.0], [74.7, 17499.0], [74.8, 17508.0], [74.9, 17529.0], [75.0, 17543.0], [75.1, 17560.0], [75.2, 17588.0], [75.3, 17595.0], [75.4, 17619.0], [75.5, 17630.0], [75.6, 17657.0], [75.7, 17676.0], [75.8, 17690.0], [75.9, 17725.0], [76.0, 17728.0], [76.1, 17738.0], [76.2, 17757.0], [76.3, 17761.0], [76.4, 17784.0], [76.5, 17803.0], [76.6, 17889.0], [76.7, 17905.0], [76.8, 17921.0], [76.9, 17939.0], [77.0, 17975.0], [77.1, 18031.0], [77.2, 18052.0], [77.3, 18073.0], [77.4, 18094.0], [77.5, 18111.0], [77.6, 18143.0], [77.7, 18153.0], [77.8, 18172.0], [77.9, 18233.0], [78.0, 18269.0], [78.1, 18284.0], [78.2, 18301.0], [78.3, 18319.0], [78.4, 18379.0], [78.5, 18403.0], [78.6, 18420.0], [78.7, 18440.0], [78.8, 18446.0], [78.9, 18482.0], [79.0, 18508.0], [79.1, 18527.0], [79.2, 18552.0], [79.3, 18574.0], [79.4, 18585.0], [79.5, 18591.0], [79.6, 18607.0], [79.7, 18630.0], [79.8, 18655.0], [79.9, 18685.0], [80.0, 18714.0], [80.1, 18727.0], [80.2, 18736.0], [80.3, 18751.0], [80.4, 18763.0], [80.5, 18786.0], [80.6, 18805.0], [80.7, 18821.0], [80.8, 18848.0], [80.9, 18890.0], [81.0, 18906.0], [81.1, 18927.0], [81.2, 18931.0], [81.3, 18938.0], [81.4, 18963.0], [81.5, 18999.0], [81.6, 19003.0], [81.7, 19027.0], [81.8, 19046.0], [81.9, 19055.0], [82.0, 19065.0], [82.1, 19095.0], [82.2, 19121.0], [82.3, 19149.0], [82.4, 19159.0], [82.5, 19168.0], [82.6, 19184.0], [82.7, 19196.0], [82.8, 19202.0], [82.9, 19217.0], [83.0, 19232.0], [83.1, 19258.0], [83.2, 19269.0], [83.3, 19285.0], [83.4, 19300.0], [83.5, 19329.0], [83.6, 19335.0], [83.7, 19366.0], [83.8, 19381.0], [83.9, 19394.0], [84.0, 19403.0], [84.1, 19409.0], [84.2, 19426.0], [84.3, 19430.0], [84.4, 19434.0], [84.5, 19435.0], [84.6, 19453.0], [84.7, 19477.0], [84.8, 19501.0], [84.9, 19502.0], [85.0, 19518.0], [85.1, 19533.0], [85.2, 19539.0], [85.3, 19563.0], [85.4, 19572.0], [85.5, 19582.0], [85.6, 19590.0], [85.7, 19599.0], [85.8, 19610.0], [85.9, 19617.0], [86.0, 19620.0], [86.1, 19630.0], [86.2, 19647.0], [86.3, 19667.0], [86.4, 19695.0], [86.5, 19735.0], [86.6, 19751.0], [86.7, 19754.0], [86.8, 19758.0], [86.9, 19760.0], [87.0, 19775.0], [87.1, 19780.0], [87.2, 19790.0], [87.3, 19801.0], [87.4, 19812.0], [87.5, 19821.0], [87.6, 19829.0], [87.7, 19837.0], [87.8, 19840.0], [87.9, 19843.0], [88.0, 19848.0], [88.1, 19850.0], [88.2, 19855.0], [88.3, 19860.0], [88.4, 19863.0], [88.5, 19870.0], [88.6, 19878.0], [88.7, 19891.0], [88.8, 19897.0], [88.9, 19902.0], [89.0, 19905.0], [89.1, 19919.0], [89.2, 19927.0], [89.3, 19932.0], [89.4, 19943.0], [89.5, 19949.0], [89.6, 19972.0], [89.7, 19974.0], [89.8, 19988.0], [89.9, 19992.0], [90.0, 20003.0], [90.1, 20009.0], [90.2, 20015.0], [90.3, 20019.0], [90.4, 20026.0], [90.5, 20027.0], [90.6, 20033.0], [90.7, 20039.0], [90.8, 20042.0], [90.9, 20049.0], [91.0, 20064.0], [91.1, 20080.0], [91.2, 20082.0], [91.3, 20098.0], [91.4, 20109.0], [91.5, 20120.0], [91.6, 20124.0], [91.7, 20129.0], [91.8, 20131.0], [91.9, 20141.0], [92.0, 20152.0], [92.1, 20161.0], [92.2, 20171.0], [92.3, 20176.0], [92.4, 20188.0], [92.5, 20197.0], [92.6, 20197.0], [92.7, 20200.0], [92.8, 20208.0], [92.9, 20235.0], [93.0, 20250.0], [93.1, 20255.0], [93.2, 20262.0], [93.3, 20266.0], [93.4, 20268.0], [93.5, 20285.0], [93.6, 20289.0], [93.7, 20292.0], [93.8, 20296.0], [93.9, 20299.0], [94.0, 20303.0], [94.1, 20311.0], [94.2, 20326.0], [94.3, 20344.0], [94.4, 20362.0], [94.5, 20367.0], [94.6, 20372.0], [94.7, 20394.0], [94.8, 20401.0], [94.9, 20412.0], [95.0, 20436.0], [95.1, 20448.0], [95.2, 20452.0], [95.3, 20468.0], [95.4, 20493.0], [95.5, 20503.0], [95.6, 20522.0], [95.7, 20533.0], [95.8, 20546.0], [95.9, 20550.0], [96.0, 20572.0], [96.1, 20592.0], [96.2, 20606.0], [96.3, 20617.0], [96.4, 20625.0], [96.5, 20631.0], [96.6, 20636.0], [96.7, 20638.0], [96.8, 20642.0], [96.9, 20658.0], [97.0, 20688.0], [97.1, 20702.0], [97.2, 20707.0], [97.3, 20720.0], [97.4, 20727.0], [97.5, 20732.0], [97.6, 20739.0], [97.7, 20753.0], [97.8, 20765.0], [97.9, 20775.0], [98.0, 20789.0], [98.1, 20810.0], [98.2, 20816.0], [98.3, 20842.0], [98.4, 20859.0], [98.5, 20867.0], [98.6, 20886.0], [98.7, 20899.0], [98.8, 20909.0], [98.9, 20939.0], [99.0, 20958.0], [99.1, 20992.0], [99.2, 21054.0], [99.3, 21099.0], [99.4, 21140.0], [99.5, 21387.0], [99.6, 21506.0], [99.7, 21571.0], [99.8, 21669.0], [99.9, 21814.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 46.0, "series": [{"data": [[400.0, 1.0], [500.0, 5.0], [600.0, 10.0], [700.0, 10.0], [800.0, 10.0], [900.0, 6.0], [1000.0, 3.0], [1100.0, 5.0], [1200.0, 7.0], [1300.0, 3.0], [1400.0, 5.0], [1500.0, 3.0], [1600.0, 5.0], [1700.0, 3.0], [1800.0, 4.0], [1900.0, 2.0], [2000.0, 4.0], [2100.0, 5.0], [2300.0, 5.0], [2200.0, 3.0], [2400.0, 3.0], [2500.0, 6.0], [2600.0, 3.0], [2800.0, 6.0], [2700.0, 6.0], [2900.0, 13.0], [3000.0, 19.0], [3100.0, 17.0], [3300.0, 13.0], [3200.0, 12.0], [3400.0, 12.0], [3500.0, 11.0], [3600.0, 12.0], [3700.0, 15.0], [3800.0, 14.0], [3900.0, 8.0], [4000.0, 14.0], [4200.0, 17.0], [4300.0, 19.0], [4100.0, 10.0], [4400.0, 20.0], [4600.0, 13.0], [4500.0, 14.0], [4800.0, 21.0], [4700.0, 22.0], [5000.0, 25.0], [5100.0, 15.0], [4900.0, 19.0], [5200.0, 11.0], [5300.0, 8.0], [5400.0, 12.0], [5500.0, 14.0], [5600.0, 14.0], [5700.0, 10.0], [5800.0, 13.0], [6100.0, 13.0], [5900.0, 12.0], [6000.0, 19.0], [6300.0, 19.0], [6200.0, 15.0], [6400.0, 20.0], [6500.0, 25.0], [6600.0, 18.0], [6700.0, 21.0], [6900.0, 18.0], [6800.0, 5.0], [7000.0, 13.0], [7100.0, 12.0], [7400.0, 17.0], [7200.0, 17.0], [7300.0, 15.0], [7500.0, 16.0], [7600.0, 8.0], [7900.0, 14.0], [7800.0, 14.0], [7700.0, 12.0], [8000.0, 11.0], [8100.0, 4.0], [8400.0, 4.0], [8300.0, 4.0], [8500.0, 8.0], [8700.0, 11.0], [8600.0, 9.0], [8200.0, 4.0], [8800.0, 19.0], [8900.0, 5.0], [9100.0, 9.0], [9000.0, 21.0], [9200.0, 6.0], [9600.0, 26.0], [9700.0, 20.0], [9300.0, 18.0], [9400.0, 17.0], [9500.0, 19.0], [9900.0, 22.0], [9800.0, 22.0], [10100.0, 16.0], [10000.0, 19.0], [10200.0, 18.0], [10300.0, 22.0], [10400.0, 16.0], [10600.0, 20.0], [10500.0, 17.0], [10700.0, 15.0], [10900.0, 6.0], [11100.0, 18.0], [11000.0, 19.0], [10800.0, 20.0], [11200.0, 19.0], [11400.0, 18.0], [11700.0, 11.0], [11600.0, 23.0], [11300.0, 19.0], [11500.0, 15.0], [12200.0, 18.0], [11800.0, 10.0], [11900.0, 12.0], [12100.0, 7.0], [12000.0, 10.0], [12300.0, 10.0], [12400.0, 17.0], [12600.0, 35.0], [12700.0, 13.0], [12500.0, 15.0], [12800.0, 14.0], [13200.0, 8.0], [13100.0, 7.0], [13300.0, 12.0], [12900.0, 10.0], [13000.0, 9.0], [13400.0, 19.0], [13700.0, 22.0], [13500.0, 10.0], [13600.0, 13.0], [13800.0, 12.0], [14000.0, 14.0], [13900.0, 13.0], [14300.0, 15.0], [14200.0, 13.0], [14100.0, 8.0], [14400.0, 15.0], [14500.0, 13.0], [14600.0, 14.0], [14800.0, 12.0], [14700.0, 12.0], [14900.0, 20.0], [15000.0, 13.0], [15300.0, 12.0], [15100.0, 21.0], [15200.0, 18.0], [15400.0, 7.0], [15500.0, 18.0], [15700.0, 11.0], [15600.0, 16.0], [15800.0, 6.0], [15900.0, 15.0], [16000.0, 15.0], [16300.0, 17.0], [16100.0, 14.0], [16200.0, 14.0], [17200.0, 7.0], [16400.0, 12.0], [16600.0, 18.0], [16800.0, 24.0], [17000.0, 12.0], [17400.0, 16.0], [17800.0, 6.0], [18000.0, 12.0], [17600.0, 16.0], [18200.0, 11.0], [18400.0, 16.0], [19200.0, 18.0], [19000.0, 18.0], [18800.0, 10.0], [18600.0, 13.0], [19400.0, 25.0], [19800.0, 46.0], [19600.0, 21.0], [20000.0, 41.0], [20200.0, 37.0], [20400.0, 21.0], [20600.0, 27.0], [20800.0, 20.0], [21000.0, 6.0], [21200.0, 1.0], [21400.0, 2.0], [21800.0, 2.0], [22000.0, 1.0], [21600.0, 3.0], [16500.0, 15.0], [16700.0, 16.0], [17100.0, 14.0], [16900.0, 13.0], [17300.0, 13.0], [17500.0, 18.0], [17700.0, 19.0], [17900.0, 10.0], [18100.0, 12.0], [18300.0, 8.0], [19100.0, 20.0], [18500.0, 17.0], [18900.0, 18.0], [18700.0, 18.0], [19300.0, 17.0], [19500.0, 28.0], [19700.0, 26.0], [20100.0, 40.0], [20300.0, 25.0], [19900.0, 35.0], [20500.0, 21.0], [20700.0, 30.0], [21100.0, 3.0], [21500.0, 4.0], [20900.0, 12.0], [21300.0, 2.0], [21700.0, 1.0], [21900.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 22000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2935.0, "series": [{"data": [[1.0, 64.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2935.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1155.7323333333345, "minX": 1.5496191E12, "maxY": 1155.7323333333345, "series": [{"data": [[1.5496191E12, 1155.7323333333345]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 776.0, "minX": 1.0, "maxY": 22026.0, "series": [{"data": [[2.0, 20670.0], [4.0, 21082.0], [5.0, 20727.0], [6.0, 20820.0], [7.0, 20699.0], [9.0, 20928.5], [10.0, 20906.0], [11.0, 20732.0], [12.0, 20888.0], [13.0, 20913.0], [14.0, 20703.0], [16.0, 20790.5], [17.0, 20780.0], [18.0, 20653.0], [19.0, 20629.0], [20.0, 20721.0], [21.0, 21387.0], [22.0, 21668.0], [23.0, 21669.0], [25.0, 21161.5], [26.0, 20859.0], [27.0, 20742.0], [28.0, 20631.0], [30.0, 20766.5], [33.0, 20614.0], [32.0, 20747.0], [35.0, 21068.0], [34.0, 20708.0], [37.0, 20955.0], [36.0, 20634.0], [39.0, 20775.0], [38.0, 20855.0], [41.0, 20638.0], [40.0, 21814.0], [43.0, 20644.0], [42.0, 20682.0], [45.0, 20642.0], [44.0, 21556.0], [47.0, 20894.0], [46.0, 20765.0], [49.0, 20636.0], [48.0, 20766.0], [51.0, 21638.0], [50.0, 20702.0], [53.0, 20622.0], [52.0, 20810.0], [55.0, 20161.0], [54.0, 20974.0], [57.0, 20003.0], [56.0, 20254.0], [59.0, 20384.0], [58.0, 20045.0], [60.0, 20401.0], [63.0, 20188.0], [62.0, 20351.5], [67.0, 20135.0], [66.0, 20590.0], [65.0, 20638.0], [64.0, 20081.0], [71.0, 20255.0], [70.0, 20296.0], [69.0, 20727.0], [68.0, 20197.0], [75.0, 20024.0], [74.0, 20268.0], [73.0, 19979.0], [72.0, 20784.0], [79.0, 19927.0], [78.0, 20175.0], [77.0, 20753.0], [76.0, 20866.0], [83.0, 20873.0], [82.0, 20546.0], [81.0, 20528.0], [80.0, 20592.0], [86.0, 20905.0], [85.0, 19860.0], [84.0, 20436.0], [88.0, 13671.333333333334], [91.0, 20152.0], [90.0, 19917.0], [89.0, 20109.0], [95.0, 20547.0], [94.0, 20131.0], [93.0, 20243.5], [99.0, 19860.0], [98.0, 20109.0], [97.0, 20265.0], [96.0, 20041.0], [103.0, 20572.0], [102.0, 19812.0], [101.0, 19974.0], [100.0, 20098.0], [107.0, 19936.0], [105.0, 20009.0], [104.0, 20042.0], [111.0, 20550.0], [110.0, 20720.0], [108.0, 20614.0], [112.0, 10235.0], [115.0, 20848.0], [114.0, 20283.0], [113.0, 20082.0], [117.0, 10223.0], [119.0, 20250.0], [118.0, 20412.0], [116.0, 20638.0], [123.0, 20209.5], [121.0, 20171.0], [120.0, 20016.0], [127.0, 20298.0], [126.0, 20124.0], [125.0, 19903.0], [124.0, 20039.0], [134.0, 10252.5], [135.0, 19817.0], [133.0, 20252.0], [132.0, 20089.0], [131.0, 20129.0], [130.0, 20285.0], [129.0, 20080.0], [128.0, 20810.0], [136.0, 7046.333333333333], [138.0, 10589.5], [140.0, 10241.0], [143.0, 20730.5], [141.0, 20198.0], [139.0, 20789.0], [137.0, 19843.0], [145.0, 7070.666666666667], [149.0, 10826.0], [148.0, 10438.5], [147.0, 10382.5], [150.0, 10647.0], [151.0, 10819.5], [146.0, 20911.0], [144.0, 20939.0], [152.0, 10387.0], [157.0, 7387.666666666667], [156.0, 7286.5], [155.0, 776.0], [159.0, 10591.5], [158.0, 10774.0], [154.0, 19878.0], [153.0, 19870.0], [163.0, 5724.25], [164.0, 7227.666666666667], [167.0, 19937.0], [166.0, 20289.0], [165.0, 19929.0], [162.0, 20266.0], [161.0, 20606.0], [169.0, 10431.0], [170.0, 10785.5], [175.0, 20197.0], [174.0, 20040.0], [173.0, 20631.0], [172.0, 20450.0], [171.0, 20860.0], [168.0, 20120.0], [177.0, 5691.25], [176.0, 10444.0], [179.0, 10291.5], [183.0, 20412.5], [181.0, 20064.0], [180.0, 20640.0], [178.0, 20544.0], [191.0, 19754.0], [190.0, 19759.0], [189.0, 20255.0], [188.0, 19758.0], [187.0, 20739.0], [186.0, 20200.0], [185.0, 20302.0], [184.0, 20122.0], [196.0, 7282.0], [199.0, 19801.0], [198.0, 20707.0], [197.0, 20174.0], [195.0, 20451.0], [194.0, 19905.0], [193.0, 20037.0], [192.0, 20037.0], [201.0, 10680.5], [207.0, 19902.0], [206.0, 20296.0], [205.0, 20297.0], [204.0, 19805.0], [203.0, 20619.5], [200.0, 20267.0], [209.0, 10492.5], [211.0, 10455.5], [213.0, 10681.0], [215.0, 20334.0], [214.0, 20303.0], [212.0, 20594.0], [210.0, 19816.0], [208.0, 20491.0], [223.0, 19991.0], [222.0, 20092.0], [221.0, 20180.0], [220.0, 19770.0], [219.0, 19837.0], [218.0, 20287.0], [217.0, 20011.0], [216.0, 20428.0], [229.0, 10360.0], [231.0, 10429.0], [230.0, 19628.0], [228.0, 19927.0], [227.0, 20197.0], [226.0, 19883.5], [224.0, 20128.0], [233.0, 7481.0], [239.0, 20299.0], [238.0, 20408.0], [237.0, 22026.0], [236.0, 20059.0], [235.0, 20306.0], [234.0, 19862.0], [232.0, 20120.0], [243.0, 10722.0], [247.0, 10872.5], [246.0, 19572.0], [245.0, 20012.0], [244.0, 20620.0], [242.0, 19778.0], [241.0, 19831.0], [240.0, 20249.0], [255.0, 20131.0], [254.0, 20617.0], [253.0, 19859.5], [251.0, 19859.0], [250.0, 20407.0], [249.0, 20043.0], [248.0, 19660.0], [270.0, 20368.0], [268.0, 10695.5], [271.0, 20133.0], [269.0, 20571.0], [267.0, 20099.0], [266.0, 20006.0], [265.0, 20339.0], [264.0, 20197.0], [263.0, 20199.0], [257.0, 20209.0], [256.0, 19825.0], [259.0, 19943.0], [258.0, 20141.0], [262.0, 20208.0], [261.0, 19581.0], [260.0, 19547.0], [287.0, 19997.0], [278.0, 10523.0], [277.0, 21000.0], [276.0, 19563.0], [282.0, 11583.5], [286.0, 20476.0], [285.0, 20909.0], [284.0, 19775.0], [275.0, 20054.0], [274.0, 20522.0], [273.0, 20457.0], [272.0, 19841.0], [279.0, 19495.0], [283.0, 19618.0], [281.0, 19407.0], [280.0, 19435.0], [302.0, 19717.0], [294.0, 8057.0], [293.0, 21804.0], [292.0, 20262.0], [295.0, 19403.0], [289.0, 19630.0], [288.0, 19617.0], [291.0, 19849.0], [290.0, 20452.0], [303.0, 10385.0], [301.0, 20292.0], [300.0, 19594.0], [299.0, 19502.0], [298.0, 20521.0], [297.0, 20366.0], [296.0, 20030.0], [319.0, 20126.0], [305.0, 10449.5], [310.0, 10899.5], [309.0, 19946.0], [308.0, 20257.0], [311.0, 19430.0], [304.0, 20291.0], [314.0, 10727.0], [318.0, 20323.0], [317.0, 19838.0], [316.0, 20326.0], [307.0, 20155.0], [306.0, 19599.0], [315.0, 20187.0], [313.0, 19773.0], [312.0, 20305.0], [334.0, 19110.0], [335.0, 19647.0], [333.0, 19809.0], [332.0, 20026.0], [331.0, 19759.0], [330.0, 21091.0], [329.0, 19780.0], [328.0, 19992.0], [327.0, 20144.0], [321.0, 19426.0], [320.0, 19827.0], [323.0, 19184.0], [322.0, 19603.0], [326.0, 19848.0], [325.0, 20243.0], [324.0, 19624.0], [350.0, 19196.0], [340.0, 10729.5], [339.0, 10752.0], [338.0, 19894.0], [337.0, 19533.0], [336.0, 19754.0], [343.0, 20188.0], [342.0, 20168.0], [341.0, 10196.5], [344.0, 10625.5], [347.0, 11325.5], [346.0, 19537.0], [345.0, 19434.0], [351.0, 10447.5], [349.0, 19645.0], [348.0, 20074.0], [366.0, 20372.0], [367.0, 19435.0], [365.0, 19590.0], [364.0, 19873.0], [363.0, 21482.0], [362.0, 21571.0], [361.0, 20764.0], [360.0, 20877.0], [359.0, 19644.0], [353.0, 19973.0], [352.0, 20026.0], [355.0, 19887.0], [354.0, 19855.0], [358.0, 19585.0], [357.0, 19829.0], [356.0, 19966.0], [382.0, 20520.0], [383.0, 19946.0], [381.0, 19159.0], [380.0, 19502.0], [379.0, 20367.0], [378.0, 20004.0], [377.0, 19065.0], [376.0, 21551.0], [375.0, 19836.0], [369.0, 19905.0], [368.0, 19983.0], [371.0, 21118.0], [370.0, 19936.0], [374.0, 19754.0], [373.0, 19187.0], [372.0, 20977.0], [398.0, 8022.666666666667], [386.0, 10469.5], [385.0, 19265.0], [384.0, 19798.0], [387.0, 19437.0], [391.0, 18890.0], [390.0, 19443.0], [389.0, 19453.0], [388.0, 19366.0], [395.0, 10333.0], [399.0, 10091.0], [397.0, 19400.0], [396.0, 21099.0], [394.0, 19993.0], [393.0, 21140.0], [392.0, 20357.0], [414.0, 20704.0], [406.0, 1338.0], [405.0, 18763.0], [404.0, 20867.0], [407.0, 20370.0], [401.0, 19161.0], [400.0, 19381.0], [403.0, 19779.0], [402.0, 19285.0], [415.0, 19731.0], [413.0, 19611.0], [412.0, 18934.0], [411.0, 18748.0], [410.0, 19501.0], [409.0, 19571.0], [408.0, 18821.0], [430.0, 19837.0], [431.0, 19339.0], [429.0, 20448.0], [428.0, 19045.0], [427.0, 19392.0], [426.0, 18806.0], [425.0, 19434.0], [424.0, 18886.0], [423.0, 19989.0], [417.0, 19663.0], [416.0, 19394.0], [419.0, 19216.0], [418.0, 19752.0], [422.0, 19610.0], [421.0, 18846.0], [420.0, 19477.0], [447.0, 19576.0], [442.0, 11201.5], [444.0, 10758.5], [435.0, 20447.0], [434.0, 20076.0], [433.0, 19493.0], [432.0, 21131.0], [446.0, 18756.0], [445.0, 20737.0], [443.0, 19004.0], [441.0, 19151.0], [440.0, 20282.0], [439.0, 20815.0], [438.0, 21045.0], [437.0, 19433.0], [436.0, 19891.0], [463.0, 19411.0], [452.0, 10780.5], [454.0, 19513.0], [453.0, 19395.0], [457.0, 10556.5], [462.0, 20205.0], [461.0, 20388.0], [460.0, 19587.0], [451.0, 19196.0], [450.0, 20602.0], [449.0, 20188.0], [448.0, 20493.0], [455.0, 19258.0], [459.0, 18655.0], [458.0, 19289.0], [456.0, 19784.0], [477.0, 19901.0], [466.0, 10988.5], [465.0, 20533.0], [464.0, 19428.0], [470.0, 7985.333333333333], [469.0, 19074.0], [468.0, 20415.0], [471.0, 1878.0], [474.0, 11006.5], [473.0, 19753.0], [472.0, 20346.5], [479.0, 20049.0], [478.0, 19420.0], [476.0, 20499.0], [467.0, 19608.0], [475.0, 19233.0], [494.0, 19223.0], [495.0, 18232.0], [493.0, 19618.0], [492.0, 18848.0], [491.0, 20015.0], [490.0, 19568.0], [489.0, 18953.0], [488.0, 19063.0], [487.0, 18902.0], [481.0, 19341.0], [480.0, 19796.0], [483.0, 19853.0], [482.0, 19171.0], [486.0, 18931.0], [485.0, 20287.0], [484.0, 20523.0], [511.0, 20026.0], [504.0, 10307.0], [510.0, 19854.0], [509.0, 19620.0], [508.0, 19790.0], [498.0, 20443.0], [497.0, 19369.0], [496.0, 19842.0], [507.0, 19875.0], [506.0, 20394.0], [505.0, 19534.0], [503.0, 19840.0], [502.0, 18817.0], [501.0, 19404.0], [500.0, 18717.5], [542.0, 17515.0], [530.0, 7772.333333333333], [540.0, 18714.0], [538.0, 18736.0], [536.0, 18448.0], [518.0, 18621.0], [516.0, 19269.0], [514.0, 18730.0], [512.0, 19546.0], [534.0, 18444.0], [532.0, 20149.0], [528.0, 19582.0], [526.0, 18727.0], [524.0, 18764.0], [520.0, 18691.0], [572.0, 19844.0], [556.0, 7582.333333333333], [554.0, 19023.5], [552.0, 18588.0], [558.0, 19335.0], [544.0, 19695.0], [550.0, 19149.0], [548.0, 18401.0], [574.0, 19217.0], [570.0, 19694.0], [568.0, 18537.0], [566.0, 18527.0], [564.0, 19202.0], [562.0, 18961.0], [560.0, 19863.0], [604.0, 19275.0], [606.0, 19330.0], [602.0, 19157.0], [600.0, 18750.0], [598.0, 18607.0], [596.0, 18999.0], [594.0, 19430.0], [592.0, 19226.0], [590.0, 19532.0], [578.0, 19300.0], [576.0, 19518.0], [582.0, 18574.0], [580.0, 19329.0], [588.0, 18906.0], [586.0, 18658.0], [584.0, 19051.0], [638.0, 18286.0], [624.0, 2226.0], [636.0, 18145.0], [634.0, 18274.0], [632.0, 17761.0], [614.0, 19257.0], [612.0, 18985.0], [610.0, 18917.0], [608.0, 18786.0], [630.0, 18347.0], [628.0, 18560.0], [626.0, 19018.0], [622.0, 18575.0], [620.0, 19211.0], [618.0, 18085.0], [616.0, 17893.0], [668.0, 18422.0], [652.0, 10748.5], [642.0, 10403.0], [646.0, 17726.0], [644.0, 18094.0], [654.0, 17448.0], [640.0, 17676.0], [648.0, 10678.0], [650.0, 17725.0], [670.0, 18111.0], [658.0, 18670.0], [656.0, 18328.0], [666.0, 18685.0], [664.0, 17529.0], [662.0, 17595.0], [660.0, 17784.0], [700.0, 18630.0], [676.0, 10470.5], [682.0, 10617.5], [680.0, 17507.0], [686.0, 18127.0], [674.0, 17491.0], [672.0, 17668.0], [684.0, 17738.0], [688.0, 17326.0], [690.0, 18482.0], [692.0, 17602.0], [702.0, 5355.833333333333], [698.0, 19134.0], [696.0, 18052.0], [678.0, 17523.0], [706.0, 8056.333333333333], [732.0, 17889.0], [708.0, 10102.0], [710.0, 17486.0], [704.0, 4564.1], [718.0, 17630.0], [712.0, 10161.5], [714.0, 17794.0], [716.0, 17508.0], [730.0, 10128.0], [728.0, 17548.0], [720.0, 16873.0], [722.0, 17170.0], [724.0, 16818.0], [726.0, 17757.0], [734.0, 17905.0], [764.0, 16621.0], [752.0, 17482.0], [754.0, 16741.0], [756.0, 16624.0], [766.0, 18316.0], [762.0, 17067.0], [760.0, 17163.0], [736.0, 17757.0], [740.0, 17740.0], [742.0, 17728.0], [750.0, 17737.0], [748.0, 16702.0], [746.0, 16829.0], [744.0, 17205.0], [758.0, 18636.0], [796.0, 17417.0], [784.0, 17733.0], [786.0, 16985.0], [788.0, 16388.0], [798.0, 18143.0], [794.0, 16455.0], [792.0, 17552.0], [768.0, 17046.0], [770.0, 16539.0], [772.0, 17529.0], [774.0, 16849.0], [782.0, 17761.0], [780.0, 17436.0], [778.0, 17619.0], [776.0, 18585.0], [790.0, 17690.0], [802.0, 9909.5], [800.0, 16914.0], [804.0, 17125.0], [814.0, 16457.0], [812.0, 16078.0], [810.0, 17435.0], [808.0, 17032.0], [806.0, 9900.5], [824.0, 16612.0], [826.0, 19168.0], [820.0, 16991.0], [822.0, 16639.0], [818.0, 16206.0], [816.0, 17676.0], [830.0, 16348.0], [828.0, 15900.0], [838.0, 15963.0], [862.0, 17830.0], [832.0, 9931.0], [834.0, 17539.0], [836.0, 16785.0], [856.0, 17124.0], [858.0, 16411.0], [860.0, 16505.0], [842.0, 10589.5], [840.0, 17307.0], [844.0, 10527.5], [846.0, 16696.0], [850.0, 9927.5], [852.0, 18078.0], [854.0, 15874.0], [848.0, 17498.0], [866.0, 15111.0], [888.0, 9400.5], [864.0, 9819.5], [868.0, 17133.0], [870.0, 15594.0], [878.0, 15768.0], [876.0, 10039.0], [874.0, 16946.0], [872.0, 16898.0], [886.0, 9552.5], [890.0, 16450.0], [892.0, 16841.0], [880.0, 16388.0], [882.0, 16561.0], [884.0, 16186.0], [894.0, 16844.0], [898.0, 15935.0], [920.0, 9724.5], [926.0, 16388.0], [900.0, 16028.0], [896.0, 16579.0], [902.0, 16690.0], [910.0, 16198.0], [908.0, 15466.0], [906.0, 16433.0], [904.0, 15961.0], [914.0, 14915.0], [916.0, 16759.0], [918.0, 16749.0], [912.0, 16225.0], [924.0, 15772.0], [922.0, 15265.0], [928.0, 9843.5], [952.0, 10116.0], [942.0, 16139.0], [940.0, 16607.0], [938.0, 16186.0], [936.0, 5954.6], [944.0, 10054.0], [950.0, 14409.0], [948.0, 16149.0], [956.0, 16291.0], [954.0, 16269.0], [958.0, 9772.0], [934.0, 10527.0], [932.0, 9329.5], [930.0, 15777.0], [962.0, 15330.0], [986.0, 7862.0], [960.0, 6868.75], [964.0, 14515.0], [966.0, 17374.0], [984.0, 15511.0], [972.0, 9389.0], [970.0, 16244.0], [968.0, 17315.0], [974.0, 15775.0], [980.0, 15545.0], [978.0, 15691.0], [982.0, 16074.5], [988.0, 10347.5], [990.0, 7717.0], [976.0, 15638.0], [992.0, 7927.333333333333], [998.0, 17096.0], [996.0, 15910.0], [994.0, 17211.0], [1016.0, 15918.0], [1000.0, 15646.0], [1002.0, 9320.0], [1006.0, 14926.0], [1004.0, 15663.0], [1020.0, 10228.5], [1022.0, 9651.0], [1008.0, 15521.0], [1010.0, 14935.0], [1012.0, 14780.0], [1014.0, 15614.0], [1028.0, 9394.5], [1076.0, 10224.0], [1032.0, 15710.0], [1036.0, 15694.0], [1072.0, 16359.0], [1024.0, 15719.0], [1052.0, 14932.0], [1048.0, 15595.0], [1044.0, 15162.0], [1040.0, 16764.0], [1080.0, 7569.666666666666], [1084.0, 9964.5], [1060.0, 7534.666666666666], [1056.0, 14890.0], [1064.0, 15150.0], [1068.0, 15180.0], [1092.0, 16500.0], [1096.0, 7655.333333333334], [1088.0, 10170.0], [1116.0, 14926.0], [1108.0, 7615.666666666667], [1112.0, 14320.0], [1104.0, 9174.5], [1144.0, 6761.75], [1140.0, 14270.0], [1136.0, 14821.0], [1100.0, 14904.0], [1148.0, 9161.5], [1120.0, 7534.666666666666], [1124.0, 9681.0], [1128.0, 5961.666666666666], [1132.0, 14671.0], [1208.0, 14085.0], [1184.0, 14385.0], [1188.0, 15383.0], [1192.0, 14432.0], [1212.0, 15220.0], [1204.0, 14368.0], [1200.0, 15006.0], [1152.0, 14735.0], [1156.0, 14197.0], [1160.0, 14690.5], [1164.0, 15065.5], [1180.0, 15274.0], [1176.0, 14354.0], [1172.0, 15253.0], [1168.0, 15508.0], [1196.0, 14956.0], [1272.0, 14494.0], [1248.0, 14892.0], [1252.0, 13295.0], [1256.0, 14714.0], [1276.0, 14238.0], [1268.0, 13917.0], [1264.0, 14607.0], [1220.0, 13580.0], [1224.0, 14047.0], [1228.0, 13622.0], [1244.0, 14082.0], [1240.0, 13866.0], [1236.0, 14864.0], [1232.0, 14177.0], [1260.0, 14038.0], [1336.0, 9992.333333333334], [1312.0, 14485.0], [1316.0, 13806.0], [1320.0, 12909.0], [1340.0, 6420.166666666667], [1332.0, 13413.0], [1328.0, 12692.0], [1280.0, 14156.0], [1288.0, 13766.0], [1292.0, 12645.0], [1308.0, 14213.0], [1304.0, 14072.0], [1300.0, 14224.0], [1296.0, 13568.0], [1324.0, 12860.0], [1400.0, 8752.5], [1356.0, 6233.833333333333], [1392.0, 8597.5], [1396.0, 13345.0], [1376.0, 8798.0], [1404.0, 13452.0], [1380.0, 6004.5], [1384.0, 13761.0], [1388.0, 8764.5], [1352.0, 7470.0], [1348.0, 6907.5], [1368.0, 7509.333333333334], [1344.0, 14058.0], [1372.0, 12990.0], [1360.0, 9170.5], [1364.0, 12118.5], [1408.0, 8751.5], [1432.0, 9115.0], [1428.0, 12744.0], [1424.0, 12415.0], [1436.0, 12093.0], [1416.0, 9115.0], [1420.0, 12673.0], [1440.0, 8739.0], [1444.0, 12354.0], [1468.0, 12566.0], [1464.0, 8420.0], [1456.0, 8781.0], [1460.0, 13488.0], [1448.0, 8369.5], [1452.0, 13360.0], [1476.0, 7212.25], [1524.0, 8131.0], [1520.0, 12066.0], [1484.0, 11663.0], [1528.0, 7366.5], [1532.0, 8035.0], [1496.0, 9016.0], [1492.0, 11717.0], [1488.0, 11468.0], [1472.0, 13719.0], [1500.0, 12289.0], [1504.0, 8346.0], [1516.0, 12287.0], [1512.0, 12682.0], [1508.0, 12646.0], [1540.0, 8484.0], [1564.0, 9160.0], [1560.0, 11670.0], [1556.0, 12178.0], [1552.0, 12045.0], [1536.0, 11007.0], [1544.0, 11188.0], [1548.0, 10858.0], [1596.0, 8641.0], [1592.0, 8486.5], [1584.0, 8483.5], [1588.0, 11615.0], [1572.0, 8495.5], [1568.0, 11532.0], [1576.0, 12108.0], [1580.0, 11739.0], [1648.0, 7286.0], [1604.0, 8949.5], [1600.0, 11844.0], [1608.0, 11307.0], [1632.0, 11457.0], [1660.0, 10033.0], [1652.0, 11484.0], [1656.0, 10772.0], [1640.0, 7614.0], [1644.0, 7223.75], [1636.0, 11278.0], [1616.0, 8530.5], [1628.0, 7269.75], [1620.0, 10400.0], [1692.0, 10980.0], [1664.0, 7984.0], [1684.0, 7811.666666666667], [1680.0, 11252.0], [1688.0, 8673.5], [1676.0, 7950.5], [1672.0, 10816.0], [1668.0, 11693.0], [1712.0, 10784.0], [1716.0, 10093.0], [1720.0, 11103.0], [1724.0, 6812.625000000001], [1696.0, 7862.0], [1700.0, 10294.0], [1704.0, 10787.0], [1708.0, 10935.0], [1736.0, 8285.0], [1740.0, 9299.666666666666], [1728.0, 8983.0], [1756.0, 7338.333333333333], [1732.0, 9970.0], [1760.0, 8260.0], [1764.0, 10096.0], [1788.0, 8775.5], [1780.0, 8566.0], [1784.0, 9982.0], [1776.0, 10171.0], [1772.0, 10175.0], [1768.0, 10296.0], [1752.0, 10894.0], [1748.0, 10509.0], [1744.0, 10537.0], [1820.0, 9869.0], [1804.0, 10261.0], [1840.0, 9474.0], [1844.0, 10814.0], [1848.0, 10008.0], [1852.0, 9961.0], [1812.0, 9493.0], [1808.0, 10710.0], [1816.0, 8561.666666666666], [1792.0, 10374.0], [1796.0, 9651.0], [1800.0, 10662.0], [1824.0, 8025.666666666667], [1828.0, 10287.0], [1832.0, 7138.0], [1836.0, 10265.0], [1864.0, 10651.0], [1860.0, 8100.333333333333], [1856.0, 11737.0], [1884.0, 7603.5], [1876.0, 9159.0], [1880.0, 8271.666666666666], [1868.0, 8740.0], [1892.0, 9845.0], [1896.0, 9855.0], [1900.0, 9679.0], [1888.0, 8151.0], [1916.0, 7604.0], [1912.0, 9919.0], [1904.0, 9507.0], [1908.0, 8497.5], [1872.0, 9801.0], [1924.0, 9329.0], [1920.0, 9519.0], [1928.0, 10145.0], [1932.0, 9283.0], [1936.0, 9024.0], [1944.0, 7640.0], [1940.0, 9863.5], [1948.0, 8883.0], [1964.0, 7115.4], [1960.0, 8712.0], [1956.0, 9081.0], [1952.0, 9213.5], [1980.0, 8932.0], [1972.0, 8758.0], [1976.0, 9664.0], [1968.0, 8043.333333333333], [2040.0, 8868.0], [1984.0, 9012.5], [1988.0, 8017.0], [1992.0, 7094.333333333333], [2020.0, 9308.0], [2024.0, 8003.0], [2028.0, 7362.0], [2016.0, 7481.666666666667], [2044.0, 8271.5], [2036.0, 9960.0], [2032.0, 8091.5], [1996.0, 8753.0], [2004.0, 9449.0], [2000.0, 10409.0], [2008.0, 9951.0], [2012.0, 8077.0], [2064.0, 8280.0], [2144.0, 8091.5], [2048.0, 8424.0], [2104.0, 7515.0], [2096.0, 8053.0], [2056.0, 7739.666666666667], [2072.0, 8375.5], [2152.0, 7420.0], [2112.0, 7967.333333333333], [2120.0, 7833.0], [2128.0, 7281.0], [2136.0, 8559.0], [2080.0, 9083.0], [2088.0, 9120.0], [2057.0, 9656.0], [2065.0, 8305.5], [2049.0, 9712.0], [2073.0, 8521.0], [2081.0, 8246.0], [2105.0, 8874.0], [2097.0, 8907.0], [2089.0, 8135.0], [2113.0, 7798.5], [2153.0, 7361.0], [2145.0, 7688.0], [2121.0, 8742.0], [2129.0, 8331.0], [2137.0, 7393.0], [1037.0, 9694.0], [1025.0, 17103.0], [1029.0, 16037.0], [1033.0, 15507.0], [1077.0, 9220.0], [1073.0, 15119.0], [1085.0, 14417.0], [1081.0, 14479.0], [1053.0, 13666.0], [1049.0, 15593.0], [1045.0, 14970.0], [1041.0, 15934.0], [1061.0, 9434.0], [1065.0, 16625.0], [1069.0, 16352.0], [1057.0, 14969.0], [1089.0, 10375.0], [1093.0, 15132.0], [1113.0, 15855.0], [1117.0, 16049.0], [1109.0, 9377.0], [1105.0, 16103.0], [1097.0, 6544.25], [1101.0, 7314.666666666666], [1137.0, 9489.0], [1141.0, 9560.5], [1145.0, 9552.5], [1149.0, 9077.5], [1121.0, 7841.333333333334], [1133.0, 9579.0], [1129.0, 5725.0], [1125.0, 14969.0], [1209.0, 15222.0], [1185.0, 13612.0], [1189.0, 15237.0], [1193.0, 15420.0], [1213.0, 14095.0], [1205.0, 14953.0], [1201.0, 15194.0], [1153.0, 14963.0], [1161.0, 13645.0], [1157.0, 14597.0], [1165.0, 14601.0], [1181.0, 14412.0], [1177.0, 15429.0], [1173.0, 15317.0], [1169.0, 14584.0], [1197.0, 13605.0], [1273.0, 14023.0], [1249.0, 13781.0], [1253.0, 13675.0], [1257.0, 13795.0], [1277.0, 13989.0], [1269.0, 13740.0], [1265.0, 13782.0], [1217.0, 15101.5], [1221.0, 14206.0], [1225.0, 13545.0], [1229.0, 13867.0], [1245.0, 14711.0], [1241.0, 13932.0], [1237.0, 15028.0], [1233.0, 13163.0], [1261.0, 13708.0], [1337.0, 7444.333333333334], [1341.0, 9045.5], [1313.0, 12146.0], [1317.0, 13260.0], [1321.0, 13998.0], [1333.0, 12803.0], [1329.0, 12764.0], [1293.0, 14559.0], [1289.0, 13484.0], [1285.0, 14242.0], [1281.0, 13723.0], [1309.0, 14544.0], [1305.0, 13340.0], [1301.0, 13203.0], [1297.0, 14440.0], [1325.0, 13966.0], [1401.0, 9009.0], [1349.0, 7511.0], [1353.0, 7641.333333333334], [1393.0, 12583.0], [1377.0, 13446.0], [1405.0, 12553.0], [1397.0, 7579.333333333334], [1381.0, 6913.25], [1385.0, 4316.0], [1389.0, 6702.75], [1357.0, 12987.0], [1345.0, 9168.5], [1369.0, 8985.5], [1373.0, 12773.0], [1365.0, 8117.333333333334], [1361.0, 6732.0], [1409.0, 9122.5], [1417.0, 7841.0], [1437.0, 12644.0], [1433.0, 12611.0], [1429.0, 13298.0], [1425.0, 12650.0], [1413.0, 10134.0], [1421.0, 7095.666666666666], [1457.0, 12435.0], [1461.0, 12548.0], [1465.0, 13427.0], [1441.0, 12367.0], [1469.0, 12522.0], [1445.0, 7823.666666666666], [1449.0, 8280.5], [1453.0, 12698.0], [1485.0, 11371.0], [1481.0, 9540.333333333334], [1525.0, 7057.0], [1529.0, 8566.0], [1533.0, 11828.0], [1521.0, 8982.5], [1497.0, 7863.5], [1493.0, 11441.0], [1489.0, 12447.0], [1501.0, 8806.5], [1473.0, 13454.0], [1477.0, 12469.0], [1505.0, 8746.0], [1509.0, 12264.0], [1513.0, 12634.0], [1517.0, 11031.0], [1537.0, 8732.5], [1585.0, 7212.25], [1565.0, 11806.0], [1561.0, 9159.5], [1553.0, 7816.666666666667], [1557.0, 12320.0], [1541.0, 8772.0], [1545.0, 8615.5], [1569.0, 7112.333333333333], [1597.0, 11683.0], [1593.0, 11758.0], [1589.0, 11669.0], [1573.0, 11983.0], [1581.0, 7794.5], [1577.0, 11700.0], [1549.0, 6836.0], [1613.0, 9380.0], [1601.0, 11400.0], [1605.0, 11227.0], [1629.0, 11294.0], [1609.0, 8560.0], [1633.0, 7197.666666666666], [1661.0, 7392.0], [1657.0, 8968.5], [1649.0, 7452.0], [1653.0, 11635.0], [1641.0, 7792.0], [1645.0, 10871.0], [1637.0, 7332.666666666667], [1617.0, 11852.0], [1621.0, 11564.0], [1625.0, 11344.0], [1665.0, 8478.0], [1717.0, 8818.0], [1673.0, 8375.5], [1669.0, 11245.0], [1689.0, 8288.666666666666], [1685.0, 11183.0], [1681.0, 10828.0], [1693.0, 10843.0], [1677.0, 8910.0], [1713.0, 10616.0], [1721.0, 6993.333333333333], [1725.0, 10633.0], [1709.0, 8828.0], [1697.0, 8023.5], [1701.0, 10886.0], [1705.0, 10785.0], [1737.0, 10045.0], [1757.0, 8631.0], [1729.0, 10646.0], [1733.0, 10390.0], [1741.0, 11078.0], [1777.0, 10506.0], [1761.0, 10418.0], [1765.0, 9923.0], [1789.0, 12260.0], [1785.0, 10361.0], [1781.0, 10649.0], [1769.0, 7549.0], [1773.0, 10398.0], [1753.0, 7848.0], [1749.0, 10692.0], [1745.0, 11270.0], [1805.0, 10094.0], [1845.0, 8225.5], [1801.0, 10283.0], [1797.0, 10602.0], [1793.0, 9702.0], [1841.0, 8432.0], [1849.0, 9385.0], [1853.0, 10137.0], [1813.0, 7710.666666666667], [1809.0, 10672.0], [1817.0, 10226.0], [1821.0, 9932.0], [1825.0, 7947.0], [1829.0, 9927.0], [1833.0, 9853.0], [1837.0, 10497.0], [1861.0, 9602.0], [1857.0, 8446.0], [1885.0, 10534.0], [1877.0, 10073.0], [1881.0, 7545.0], [1865.0, 9907.0], [1869.0, 8474.0], [1889.0, 7630.333333333333], [1893.0, 7644.0], [1897.0, 8107.0], [1901.0, 9961.0], [1917.0, 7927.5], [1909.0, 9084.0], [1913.0, 7363.0], [1905.0, 7915.5], [1873.0, 8233.0], [1921.0, 7635.0], [1929.0, 11144.0], [1969.0, 7811.666666666667], [1925.0, 7715.5], [1933.0, 9647.0], [1937.0, 7623.333333333333], [1941.0, 9409.0], [1945.0, 9597.0], [1949.0, 9530.0], [1953.0, 9076.5], [1961.0, 9343.0], [1957.0, 9015.0], [1965.0, 8124.5], [1981.0, 9664.0], [1973.0, 9432.0], [1977.0, 9030.0], [2041.0, 9128.0], [1985.0, 7668.0], [1989.0, 9500.0], [1993.0, 8203.0], [2017.0, 7715.333333333333], [2025.0, 9926.0], [2029.0, 8110.25], [2045.0, 9098.0], [2037.0, 7518.333333333333], [1997.0, 10344.0], [2033.0, 8843.0], [2005.0, 10313.0], [2001.0, 8564.0], [2009.0, 7953.5], [2013.0, 7544.0], [2066.0, 8666.0], [2050.0, 8774.0], [2106.0, 7724.0], [2098.0, 8021.0], [2058.0, 8683.0], [2074.0, 9894.0], [2154.0, 7879.0], [2146.0, 7991.0], [2114.0, 7861.0], [2122.0, 7775.0], [2130.0, 7596.0], [2138.0, 8088.0], [2082.0, 7263.0], [2090.0, 7966.0], [2059.0, 9033.0], [2051.0, 7943.5], [2067.0, 8604.0], [2075.0, 9619.0], [2083.0, 7929.5], [2107.0, 7856.75], [2091.0, 7874.0], [2115.0, 8846.0], [2155.0, 7434.666666666667], [2147.0, 7326.5], [2123.0, 7782.0], [2131.0, 7758.5], [2139.0, 7231.0], [541.0, 19539.0], [543.0, 18784.0], [539.0, 18963.0], [537.0, 19332.0], [535.0, 18729.0], [533.0, 19194.0], [531.0, 19003.0], [529.0, 19002.0], [527.0, 19121.0], [515.0, 19301.0], [513.0, 19027.0], [519.0, 19177.0], [517.0, 20265.0], [525.0, 19676.0], [523.0, 19161.5], [521.0, 18546.0], [571.0, 19521.0], [545.0, 11022.5], [551.0, 10574.5], [549.0, 19513.0], [547.0, 19080.0], [557.0, 10701.5], [555.0, 18403.0], [559.0, 18696.0], [567.0, 10927.5], [575.0, 19751.0], [573.0, 18984.0], [569.0, 19879.0], [565.0, 18487.0], [563.0, 18394.0], [561.0, 18633.0], [607.0, 18110.0], [583.0, 10463.5], [577.0, 10836.5], [581.0, 18013.0], [579.0, 19062.0], [591.0, 18929.0], [589.0, 19260.0], [587.0, 19055.0], [585.0, 18927.0], [599.0, 7695.666666666667], [605.0, 19047.0], [603.0, 18269.0], [601.0, 18057.0], [597.0, 18313.0], [595.0, 19198.0], [593.0, 19384.0], [639.0, 10320.0], [611.0, 10331.0], [623.0, 18070.0], [609.0, 19454.0], [621.0, 19232.0], [619.0, 18440.0], [617.0, 17927.0], [629.0, 10399.5], [631.0, 10288.0], [635.0, 10798.5], [637.0, 18793.0], [633.0, 18413.0], [615.0, 18759.0], [613.0, 19296.0], [627.0, 18916.0], [625.0, 18624.0], [669.0, 17640.0], [671.0, 17392.0], [667.0, 18233.0], [665.0, 17921.0], [663.0, 18721.0], [661.0, 17657.0], [659.0, 17543.0], [657.0, 18579.0], [655.0, 17499.0], [643.0, 18073.0], [641.0, 18513.0], [647.0, 18284.0], [645.0, 17827.0], [653.0, 18026.0], [651.0, 18149.0], [649.0, 18482.0], [687.0, 10648.5], [685.0, 7742.0], [681.0, 6586.75], [683.0, 10122.0], [703.0, 5461.333333333334], [689.0, 17601.0], [691.0, 17324.0], [695.0, 17951.0], [693.0, 17072.0], [701.0, 7636.333333333333], [699.0, 18479.0], [697.0, 17016.0], [679.0, 18420.0], [677.0, 17487.0], [675.0, 17570.0], [673.0, 17896.0], [707.0, 10509.5], [709.0, 17689.0], [705.0, 10209.5], [719.0, 16865.0], [713.0, 18591.0], [715.0, 17619.0], [711.0, 5679.4], [717.0, 10398.5], [729.0, 18405.0], [731.0, 18938.0], [733.0, 16687.0], [735.0, 17472.0], [721.0, 17588.0], [723.0, 18284.0], [725.0, 17916.0], [727.0, 17083.0], [765.0, 17343.0], [767.0, 16691.0], [753.0, 17128.0], [755.0, 17564.0], [757.0, 16852.0], [763.0, 16551.0], [761.0, 17678.0], [751.0, 16898.0], [739.0, 17986.0], [737.0, 17588.0], [741.0, 17622.0], [743.0, 16879.0], [749.0, 16872.0], [747.0, 16801.0], [745.0, 18273.0], [759.0, 17796.0], [797.0, 17281.0], [799.0, 17213.0], [785.0, 18032.0], [787.0, 16944.0], [789.0, 17484.0], [795.0, 17840.0], [793.0, 16582.0], [783.0, 16945.0], [769.0, 16518.0], [771.0, 16878.0], [773.0, 17368.0], [775.0, 18319.0], [781.0, 18250.0], [779.0, 18041.0], [777.0, 18156.0], [791.0, 17097.0], [801.0, 16622.0], [825.0, 16145.0], [829.0, 10500.5], [803.0, 17388.0], [815.0, 17118.0], [813.0, 16435.0], [811.0, 16942.0], [809.0, 17771.0], [805.0, 9727.0], [807.0, 17239.0], [819.0, 10360.5], [821.0, 7438.0], [823.0, 17698.0], [831.0, 16332.0], [817.0, 16012.0], [827.0, 18109.0], [835.0, 11048.5], [857.0, 17295.0], [833.0, 16069.0], [837.0, 17560.0], [839.0, 16193.0], [859.0, 15932.0], [841.0, 16807.0], [845.0, 16162.0], [847.0, 17171.0], [843.0, 10053.0], [851.0, 10093.0], [853.0, 15903.0], [855.0, 7689.333333333333], [863.0, 17214.0], [849.0, 17760.0], [867.0, 16535.0], [865.0, 16995.0], [869.0, 15802.0], [871.0, 16904.0], [879.0, 16743.0], [877.0, 16827.0], [875.0, 9712.5], [873.0, 15950.0], [885.0, 10227.0], [887.0, 18031.0], [889.0, 9213.0], [891.0, 16765.0], [893.0, 16506.0], [895.0, 16770.0], [881.0, 15362.0], [883.0, 16116.0], [899.0, 15122.0], [901.0, 9809.0], [897.0, 15084.0], [903.0, 16457.0], [911.0, 16559.0], [909.0, 16080.0], [907.0, 16179.0], [905.0, 15001.0], [913.0, 9491.0], [915.0, 9845.0], [917.0, 17716.0], [919.0, 16323.0], [927.0, 16692.0], [925.0, 16708.0], [923.0, 16255.0], [921.0, 16363.0], [933.0, 6944.5], [929.0, 9871.0], [943.0, 10274.5], [941.0, 15025.0], [939.0, 16029.0], [935.0, 10223.5], [951.0, 17740.0], [949.0, 16664.0], [947.0, 15890.5], [945.0, 14949.0], [959.0, 10421.0], [957.0, 9845.5], [955.0, 15948.0], [953.0, 16394.0], [931.0, 10015.5], [937.0, 10098.0], [963.0, 14779.0], [961.0, 9778.5], [965.0, 16240.0], [967.0, 14650.0], [985.0, 16783.0], [971.0, 15660.0], [969.0, 15657.0], [973.0, 14882.0], [975.0, 15497.0], [977.0, 9079.0], [981.0, 3555.0], [979.0, 16205.0], [983.0, 17197.0], [987.0, 15956.0], [989.0, 16238.0], [991.0, 9926.5], [993.0, 15749.0], [1017.0, 17004.0], [999.0, 9598.5], [995.0, 16985.0], [1001.0, 6656.75], [1007.0, 16291.0], [1005.0, 17010.0], [1003.0, 17070.0], [1021.0, 10636.0], [1023.0, 9362.5], [1009.0, 15574.0], [1011.0, 15241.0], [1013.0, 16839.0], [1015.0, 15176.0], [1019.0, 15664.0], [1026.0, 9037.0], [1030.0, 10140.0], [1034.0, 16823.0], [1038.0, 15622.0], [1074.0, 16446.0], [1054.0, 14890.0], [1050.0, 16515.0], [1046.0, 15556.0], [1042.0, 14761.0], [1078.0, 9125.0], [1082.0, 15395.0], [1058.0, 15176.0], [1062.0, 15667.0], [1066.0, 15312.0], [1070.0, 15106.0], [1086.0, 14376.0], [1090.0, 7443.666666666666], [1094.0, 16273.0], [1118.0, 14538.0], [1114.0, 8973.0], [1110.0, 7481.333333333334], [1106.0, 15050.0], [1098.0, 7784.666666666666], [1142.0, 14860.0], [1138.0, 14312.0], [1102.0, 14637.0], [1146.0, 9337.5], [1150.0, 13804.0], [1122.0, 15396.0], [1126.0, 16099.0], [1130.0, 8183.333333333334], [1134.0, 14704.0], [1210.0, 15203.0], [1214.0, 13159.0], [1186.0, 14616.0], [1190.0, 13445.0], [1194.0, 13788.0], [1206.0, 13848.0], [1202.0, 15244.0], [1182.0, 15113.0], [1154.0, 15110.0], [1158.0, 14530.0], [1162.0, 15745.0], [1166.0, 13642.0], [1178.0, 13698.0], [1174.0, 14613.0], [1170.0, 15233.0], [1198.0, 13603.0], [1274.0, 14265.0], [1278.0, 14230.0], [1250.0, 13939.0], [1254.0, 14157.0], [1258.0, 14678.0], [1270.0, 14644.0], [1266.0, 13749.0], [1246.0, 14035.0], [1218.0, 14374.0], [1222.0, 14240.0], [1226.0, 14266.0], [1230.0, 13271.0], [1242.0, 13382.0], [1238.0, 14911.0], [1234.0, 15387.0], [1262.0, 13751.0], [1338.0, 9787.0], [1342.0, 7048.25], [1314.0, 13745.0], [1318.0, 12931.0], [1322.0, 13674.0], [1334.0, 13016.0], [1330.0, 12905.0], [1310.0, 14363.0], [1286.0, 13130.0], [1282.0, 14830.0], [1290.0, 13323.0], [1294.0, 14308.0], [1306.0, 14142.0], [1302.0, 12344.0], [1298.0, 14300.0], [1326.0, 13900.0], [1406.0, 13017.0], [1394.0, 9163.0], [1358.0, 8788.0], [1398.0, 6314.4], [1378.0, 13659.0], [1402.0, 12865.0], [1382.0, 9003.5], [1386.0, 12893.0], [1390.0, 12929.0], [1354.0, 7608.0], [1350.0, 6155.166666666666], [1346.0, 7418.666666666666], [1370.0, 12647.0], [1374.0, 13876.0], [1366.0, 8614.0], [1362.0, 12658.0], [1410.0, 9056.5], [1414.0, 7640.0], [1430.0, 12701.0], [1426.0, 12539.0], [1434.0, 13427.0], [1418.0, 6879.0], [1422.0, 8879.0], [1442.0, 13390.0], [1446.0, 12688.0], [1470.0, 12491.0], [1466.0, 12374.0], [1462.0, 12291.0], [1458.0, 13527.0], [1450.0, 4592.0], [1454.0, 9127.0], [1486.0, 11649.0], [1526.0, 7900.0], [1482.0, 11546.0], [1478.0, 11411.0], [1522.0, 7535.333333333334], [1530.0, 12381.0], [1534.0, 9038.0], [1494.0, 12618.0], [1490.0, 12655.0], [1498.0, 12439.0], [1502.0, 12887.0], [1474.0, 12307.0], [1518.0, 11506.0], [1514.0, 11533.0], [1510.0, 12249.0], [1506.0, 11485.0], [1542.0, 9094.0], [1546.0, 7867.5], [1566.0, 8907.5], [1562.0, 7695.666666666666], [1558.0, 11685.0], [1554.0, 11862.0], [1538.0, 7370.333333333334], [1550.0, 7538.0], [1594.0, 9368.5], [1590.0, 11970.0], [1586.0, 11647.0], [1598.0, 11480.0], [1570.0, 12274.0], [1578.0, 9217.5], [1574.0, 11915.0], [1582.0, 12159.0], [1658.0, 9153.0], [1610.0, 8250.5], [1602.0, 11523.0], [1606.0, 11651.0], [1662.0, 6833.75], [1614.0, 11323.0], [1650.0, 11426.0], [1654.0, 10810.0], [1634.0, 8460.0], [1642.0, 10899.0], [1646.0, 11382.0], [1638.0, 6740.6], [1618.0, 8351.5], [1626.0, 11034.0], [1622.0, 11105.0], [1630.0, 11708.0], [1694.0, 7364.333333333333], [1718.0, 8076.0], [1666.0, 8774.0], [1678.0, 8543.0], [1682.0, 11039.0], [1686.0, 11451.0], [1690.0, 11252.0], [1674.0, 11059.0], [1670.0, 11064.0], [1714.0, 8670.0], [1722.0, 7996.666666666667], [1726.0, 7734.5], [1698.0, 4815.0], [1702.0, 7990.666666666667], [1706.0, 7393.25], [1710.0, 8326.0], [1742.0, 6886.75], [1758.0, 8495.0], [1734.0, 10440.0], [1730.0, 11333.0], [1738.0, 10543.0], [1762.0, 10681.0], [1790.0, 9715.0], [1782.0, 8007.0], [1786.0, 9911.0], [1778.0, 8909.0], [1774.0, 8514.0], [1770.0, 9741.0], [1766.0, 9058.0], [1754.0, 7870.0], [1750.0, 10463.0], [1746.0, 10446.0], [1822.0, 9802.0], [1842.0, 10292.0], [1806.0, 10284.0], [1846.0, 10244.0], [1850.0, 9950.0], [1854.0, 8330.0], [1810.0, 10060.0], [1814.0, 9742.0], [1818.0, 7988.0], [1794.0, 10140.0], [1798.0, 10865.0], [1802.0, 10272.0], [1826.0, 10333.0], [1830.0, 9713.0], [1834.0, 10524.0], [1838.0, 9857.0], [1862.0, 6718.5], [1858.0, 9599.0], [1886.0, 9831.0], [1882.0, 7309.0], [1878.0, 10446.0], [1866.0, 7494.0], [1890.0, 8053.0], [1894.0, 8095.0], [1902.0, 7468.0], [1898.0, 8587.5], [1918.0, 8479.0], [1914.0, 8315.5], [1910.0, 10302.0], [1870.0, 10156.0], [1906.0, 10314.0], [1874.0, 7760.5], [1926.0, 8261.0], [1922.0, 9805.0], [1930.0, 9342.0], [1934.0, 9951.0], [1938.0, 10797.0], [1942.0, 9722.0], [1946.0, 9572.0], [1950.0, 9974.0], [1962.0, 9526.0], [1958.0, 9514.0], [1954.0, 9514.0], [1966.0, 9446.0], [1982.0, 8255.5], [1970.0, 8841.0], [1974.0, 9756.0], [1978.0, 9025.5], [1994.0, 9539.0], [2042.0, 8775.0], [1986.0, 7796.333333333333], [2014.0, 8283.5], [1990.0, 7357.0], [2022.0, 9023.0], [2018.0, 9975.0], [2026.0, 7577.666666666667], [2030.0, 8664.0], [2046.0, 9974.0], [2038.0, 9112.0], [1998.0, 9270.0], [2034.0, 9690.0], [2006.0, 7942.5], [2002.0, 9172.0], [2010.0, 8940.0], [2068.0, 8536.0], [2052.0, 7932.5], [2108.0, 8687.0], [2100.0, 5786.0], [2060.0, 9017.0], [2076.0, 8451.0], [2148.0, 8354.0], [2156.0, 7349.0], [2116.0, 7582.0], [2124.0, 7735.0], [2132.0, 7551.0], [2140.0, 7882.5], [2084.0, 7761.5], [2092.0, 7265.5], [2061.0, 9015.0], [2053.0, 9087.0], [2069.0, 8521.0], [2077.0, 7833.0], [2085.0, 8175.0], [2101.0, 7958.0], [2093.0, 7767.0], [2109.0, 8514.0], [2149.0, 7411.0], [2125.0, 8525.0], [2133.0, 7606.0], [2141.0, 7495.0], [1039.0, 9122.0], [1027.0, 9448.5], [1031.0, 9837.5], [1035.0, 15404.0], [1075.0, 16471.0], [1083.0, 9865.5], [1087.0, 10046.0], [1079.0, 6707.0], [1055.0, 9768.5], [1051.0, 15039.0], [1047.0, 14857.0], [1043.0, 15572.0], [1063.0, 9328.5], [1067.0, 15461.0], [1071.0, 14503.0], [1059.0, 6508.0], [1091.0, 14486.0], [1103.0, 9190.5], [1119.0, 9664.5], [1115.0, 9501.0], [1111.0, 14514.0], [1107.0, 7121.5], [1095.0, 6278.5], [1099.0, 9388.0], [1139.0, 14526.0], [1143.0, 15566.0], [1147.0, 14160.0], [1151.0, 15590.0], [1123.0, 7964.666666666666], [1131.0, 9040.0], [1135.0, 14793.0], [1127.0, 8982.0], [1211.0, 13706.0], [1215.0, 15157.0], [1187.0, 15177.0], [1191.0, 13467.0], [1195.0, 13553.0], [1207.0, 15208.0], [1203.0, 14764.0], [1183.0, 14146.0], [1155.0, 15558.0], [1167.0, 15359.0], [1179.0, 14285.0], [1171.0, 14033.0], [1199.0, 13335.0], [1275.0, 14402.0], [1279.0, 14878.0], [1251.0, 13932.0], [1255.0, 14260.0], [1259.0, 13438.0], [1271.0, 14084.0], [1267.0, 13956.0], [1247.0, 13702.0], [1219.0, 14796.0], [1223.0, 14809.0], [1227.0, 13421.0], [1231.0, 13311.0], [1243.0, 14463.0], [1239.0, 14565.0], [1235.0, 14349.0], [1263.0, 13737.0], [1331.0, 12674.0], [1343.0, 7674.0], [1315.0, 13541.0], [1319.0, 13043.0], [1323.0, 12879.0], [1339.0, 6896.5], [1295.0, 14133.0], [1291.0, 13836.0], [1287.0, 12587.0], [1283.0, 13646.0], [1311.0, 13731.0], [1307.0, 14095.0], [1303.0, 13754.0], [1299.0, 13436.0], [1327.0, 13850.0], [1407.0, 8811.0], [1395.0, 7281.0], [1359.0, 7625.333333333334], [1379.0, 12663.0], [1403.0, 13403.0], [1399.0, 12807.0], [1383.0, 9114.0], [1387.0, 8999.5], [1391.0, 8641.5], [1355.0, 6181.0], [1351.0, 6361.166666666667], [1347.0, 13183.0], [1375.0, 7182.333333333334], [1371.0, 12833.0], [1367.0, 6178.2], [1363.0, 4864.0], [1411.0, 8439.5], [1415.0, 8561.0], [1439.0, 12233.5], [1435.0, 12605.0], [1431.0, 12483.0], [1427.0, 12699.0], [1419.0, 8991.5], [1423.0, 12598.0], [1459.0, 13111.0], [1467.0, 7713.666666666666], [1471.0, 12224.0], [1443.0, 12226.0], [1463.0, 8727.5], [1447.0, 7951.333333333334], [1455.0, 7279.0], [1451.0, 12974.5], [1483.0, 7924.0], [1523.0, 8557.5], [1527.0, 8664.0], [1535.0, 8791.0], [1531.0, 12458.0], [1487.0, 11698.0], [1495.0, 12651.0], [1491.0, 11689.0], [1499.0, 12637.0], [1503.0, 8263.0], [1475.0, 12678.0], [1479.0, 12444.0], [1507.0, 6359.5], [1511.0, 12664.0], [1515.0, 8695.0], [1519.0, 12228.0], [1543.0, 12159.0], [1539.0, 9126.0], [1567.0, 11621.0], [1563.0, 11951.0], [1555.0, 8333.0], [1559.0, 12297.0], [1599.0, 12244.0], [1595.0, 11549.0], [1591.0, 11817.0], [1587.0, 11333.0], [1571.0, 7858.0], [1575.0, 7572.666666666666], [1579.0, 10795.0], [1583.0, 11572.0], [1547.0, 12016.0], [1551.0, 12324.0], [1611.0, 6724.2], [1603.0, 9028.5], [1607.0, 11915.0], [1631.0, 10972.0], [1663.0, 11099.0], [1659.0, 8607.5], [1615.0, 11498.0], [1651.0, 11230.0], [1655.0, 11180.0], [1639.0, 6747.5], [1643.0, 11594.0], [1647.0, 11109.0], [1635.0, 11244.0], [1619.0, 8183.0], [1623.0, 11747.0], [1627.0, 8962.5], [1671.0, 11881.0], [1675.0, 8601.5], [1667.0, 7379.5], [1687.0, 10581.0], [1683.0, 11439.0], [1691.0, 10324.0], [1695.0, 11169.0], [1679.0, 8626.5], [1715.0, 7711.0], [1719.0, 7177.5], [1723.0, 7861.5], [1727.0, 8557.5], [1711.0, 7326.666666666667], [1699.0, 10575.0], [1703.0, 11058.0], [1707.0, 10697.0], [1739.0, 5086.0], [1779.0, 7600.0], [1731.0, 8705.0], [1759.0, 10176.0], [1735.0, 10648.0], [1743.0, 10714.0], [1791.0, 7229.0], [1763.0, 10743.0], [1787.0, 10334.0], [1783.0, 10261.0], [1767.0, 8164.5], [1771.0, 8176.0], [1775.0, 8496.333333333334], [1751.0, 10273.0], [1747.0, 10278.0], [1755.0, 9008.5], [1807.0, 8440.0], [1851.0, 8696.5], [1823.0, 6858.666666666667], [1803.0, 10054.0], [1799.0, 10014.0], [1795.0, 9555.0], [1843.0, 9643.0], [1847.0, 10229.0], [1855.0, 9864.0], [1811.0, 10554.0], [1815.0, 10138.0], [1819.0, 10180.0], [1827.0, 10206.0], [1835.0, 8647.0], [1839.0, 10288.0], [1831.0, 7933.0], [1859.0, 9975.0], [1863.0, 7575.0], [1887.0, 7982.0], [1883.0, 10505.0], [1879.0, 8163.5], [1875.0, 10029.0], [1867.0, 8081.0], [1891.0, 11066.0], [1895.0, 9983.0], [1899.0, 8251.5], [1903.0, 7508.0], [1919.0, 9726.0], [1915.0, 7918.0], [1911.0, 7845.666666666667], [1871.0, 9646.0], [1907.0, 10335.0], [1927.0, 9420.0], [1923.0, 9240.0], [1931.0, 9526.0], [1935.0, 8573.0], [1939.0, 7919.0], [1943.0, 9688.0], [1947.0, 9684.0], [1951.0, 7136.2], [1963.0, 9059.0], [1959.0, 9855.0], [1955.0, 8892.0], [1967.0, 9378.0], [1979.0, 8380.0], [1983.0, 6286.5], [1971.0, 8067.333333333333], [1975.0, 9731.0], [1995.0, 7885.5], [2015.0, 7835.5], [1987.0, 9013.0], [1991.0, 8782.0], [2023.0, 7772.0], [2019.0, 8924.0], [2031.0, 10108.0], [2027.0, 8250.5], [2047.0, 8195.0], [2043.0, 8292.0], [2039.0, 7779.333333333333], [1999.0, 9455.0], [2035.0, 7695.5], [2003.0, 9093.0], [2007.0, 9050.0], [2011.0, 9358.0], [2062.0, 7852.0], [2110.0, 8646.0], [2102.0, 8881.0], [2094.0, 8864.0], [2054.0, 9624.0], [2070.0, 6848.0], [2078.0, 8454.0], [2150.0, 7409.0], [2118.0, 7973.666666666667], [2126.0, 7880.5], [2134.0, 7412.5], [2142.0, 7459.0], [2086.0, 7920.0], [2063.0, 8793.0], [2071.0, 8165.833333333333], [2055.0, 9046.0], [2087.0, 7490.0], [2103.0, 8809.0], [2095.0, 8886.0], [2111.0, 8193.5], [2151.0, 7254.0], [2119.0, 7426.75], [2127.0, 7516.333333333333], [2135.0, 7377.5], [2143.0, 7423.0], [1.0, 20701.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1155.7323333333345, 12191.118666666674]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2156.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18850.0, "minX": 1.5496191E12, "maxY": 21046.766666666666, "series": [{"data": [[1.5496191E12, 21046.766666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496191E12, 18850.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 12191.118666666674, "minX": 1.5496191E12, "maxY": 12191.118666666674, "series": [{"data": [[1.5496191E12, 12191.118666666674]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 12191.107999999993, "minX": 1.5496191E12, "maxY": 12191.107999999993, "series": [{"data": [[1.5496191E12, 12191.107999999993]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 50.13699999999997, "minX": 1.5496191E12, "maxY": 50.13699999999997, "series": [{"data": [[1.5496191E12, 50.13699999999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 445.0, "minX": 1.5496191E12, "maxY": 22026.0, "series": [{"data": [[1.5496191E12, 22026.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496191E12, 445.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496191E12, 20002.4]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496191E12, 20958.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496191E12, 20435.6]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 12251.5, "minX": 50.0, "maxY": 12251.5, "series": [{"data": [[50.0, 12251.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 12251.5, "minX": 50.0, "maxY": 12251.5, "series": [{"data": [[50.0, 12251.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5496191E12, "maxY": 50.0, "series": [{"data": [[1.5496191E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5496191E12, "maxY": 50.0, "series": [{"data": [[1.5496191E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5496191E12, "maxY": 50.0, "series": [{"data": [[1.5496191E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Transactions Per Second"}},
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
